using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public sealed class BenchmarkJob : IDisposable {
    [StructLayout(LayoutKind.Sequential)]
    public struct Accounting {
        public long TotalUserTime, TotalKernelTime, ThisPeriodTotalUserTime, ThisPeriodTotalKernelTime;
        public uint TotalPageFaultCount, TotalProcesses, ActiveProcesses, TotalTerminatedProcesses;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct BasicLimits {
        public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct ExtendedLimits {
        public BasicLimits BasicLimitInformation;
        public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct Startup {
        public uint cb;
        public IntPtr lpReserved, lpDesktop, lpTitle;
        public uint dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
        public ushort wShowWindow, cbReserved2;
        public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct ProcessHandles { public IntPtr hProcess, hThread; public uint dwProcessId, dwThreadId; }
    [StructLayout(LayoutKind.Sequential)]
    struct MemoryCounters {
        public uint cb, PageFaultCount;
        public UIntPtr PeakWorkingSetSize, WorkingSetSize, QuotaPeakPagedPoolUsage, QuotaPagedPoolUsage;
        public UIntPtr QuotaPeakNonPagedPoolUsage, QuotaNonPagedPoolUsage, PagefileUsage, PeakPagefileUsage;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct SecurityAttributes { public uint nLength; public IntPtr lpSecurityDescriptor; public int bInheritHandle; }
    public sealed class Member { public uint pid; public double residentBytes, cpuSeconds; }
    public sealed class Sample {
        public string kind = "sample";
        public long epochMs;
        public double residentBytes, cpuSeconds;
        public Accounting accounting;
        public List<Member> members = new List<Member>();
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern IntPtr CreateJobObjectW(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits limits, uint length);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool QueryInformationJobObject(IntPtr job, int kind, IntPtr result, uint length, IntPtr returnedLength);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool CreateProcessW(string application, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes,
        bool inheritHandles, uint flags, IntPtr environment, string directory, ref Startup startup, out ProcessHandles process);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool TerminateProcess(IntPtr process, uint status);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool TerminateJobObject(IntPtr job, uint status);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool member);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetProcessTimes(IntPtr process, out long created, out long exited, out long kernel, out long user);
    [DllImport("psapi.dll", SetLastError = true)]
    static extern bool GetProcessMemoryInfo(IntPtr process, ref MemoryCounters counters, uint length);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern IntPtr CreateFileW(string path, uint access, uint sharing, ref SecurityAttributes security,
        uint creation, uint attributes, IntPtr template);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr handle);

    IntPtr job, root;
    static Win32Exception Failure() { return new Win32Exception(Marshal.GetLastWin32Error()); }
    public BenchmarkJob() {
        job = CreateJobObjectW(IntPtr.Zero, null);
        if (job == IntPtr.Zero) throw Failure();
        var limits = new ExtendedLimits();
        limits.BasicLimitInformation.LimitFlags = 0x2000; // KILL_ON_JOB_CLOSE; no breakaway (#1560).
        if (!SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits))) {
            var failure = Failure(); Dispose(); throw failure;
        }
    }
    public long Launch(string executable, string log, string arguments = "") {
        var security = new SecurityAttributes { nLength = (uint)Marshal.SizeOf(typeof(SecurityAttributes)), bInheritHandle = 1 };
        IntPtr output = CreateFileW(log, 0x40000000, 3, ref security, 2, 0x80, IntPtr.Zero);
        if (output == new IntPtr(-1)) throw Failure();
        IntPtr input = CreateFileW("NUL", 0x80000000, 3, ref security, 3, 0x80, IntPtr.Zero);
        try {
            if (input == new IntPtr(-1)) throw Failure();
            var startup = new Startup { cb = (uint)Marshal.SizeOf(typeof(Startup)), dwFlags = 0x100,
                hStdInput = input, hStdOutput = output, hStdError = output };
            ProcessHandles process;
            long epochMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (!CreateProcessW(executable, new StringBuilder("\"" + executable + "\" " + arguments), IntPtr.Zero,
                IntPtr.Zero, true, 4, IntPtr.Zero, null, ref startup, out process)) throw Failure();
            root = process.hProcess;
            try {
                // Assign while suspended so no child can run outside cumulative job accounting (#1560).
                if (!AssignProcessToJobObject(job, root) || ResumeThread(process.hThread) == uint.MaxValue) {
                    var failure = Failure();
                    if (!TerminateProcess(root, 1)) throw Failure();
                    throw failure;
                }
            } finally { CloseHandle(process.hThread); }
            return epochMs;
        } finally {
            CloseHandle(output);
            if (input != new IntPtr(-1)) CloseHandle(input);
        }
    }
    List<uint> MemberIds() {
        for (int capacity = 64; ; capacity = checked(capacity * 2)) {
            int size = checked(8 + capacity * IntPtr.Size);
            IntPtr buffer = Marshal.AllocHGlobal(size);
            try {
                bool success = QueryInformationJobObject(job, 3, buffer, (uint)size, IntPtr.Zero);
                int error = success ? 0 : Marshal.GetLastWin32Error();
                if (!success && error != 234) throw new Win32Exception(error);
                if (!success || Marshal.ReadInt32(buffer) > Marshal.ReadInt32(buffer, 4)) continue;
                var members = new List<uint>();
                for (int index = 0; index < Marshal.ReadInt32(buffer, 4); index++)
                    members.Add(checked((uint)Marshal.ReadIntPtr(buffer, 8 + index * IntPtr.Size).ToInt64()));
                return members;
            } finally { Marshal.FreeHGlobal(buffer); }
        }
    }
    Member ReadMember(uint pid) {
        IntPtr process = OpenProcess(0x101000, false, pid);
        if (process == IntPtr.Zero) {
            int error = Marshal.GetLastWin32Error();
            if (!MemberIds().Contains(pid)) return null; // Departed member; its CPU remains in job accounting (#1560).
            throw new Win32Exception(error);
        }
        try {
            bool member;
            if (!IsProcessInJob(process, job, out member)) throw Failure();
            if (!member) return null; // Reused PID; never charge its RSS to the previous member (#1560).
            var counters = new MemoryCounters { cb = (uint)Marshal.SizeOf(typeof(MemoryCounters)) };
            long created, exited, kernel, user;
            if (!GetProcessMemoryInfo(process, ref counters, counters.cb) ||
                !GetProcessTimes(process, out created, out exited, out kernel, out user)) {
                var failure = Failure();
                if (WaitForSingleObject(process, 0) == 0) return null;
                throw failure;
            }
            return new Member { pid = pid, residentBytes = counters.WorkingSetSize.ToUInt64(), cpuSeconds = (kernel + user) / 1e7 };
        } finally { CloseHandle(process); }
    }
    public Sample Read() {
        if (root == IntPtr.Zero || WaitForSingleObject(root, 0) != 258) throw new InvalidOperationException("Shell process exited");
        var sample = new Sample();
        foreach (uint pid in MemberIds()) {
            var member = ReadMember(pid);
            if (member != null) { sample.members.Add(member); sample.residentBytes += member.residentBytes; }
        }
        IntPtr buffer = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(Accounting)));
        try {
            if (!QueryInformationJobObject(job, 1, buffer, (uint)Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero)) throw Failure();
            sample.accounting = (Accounting)Marshal.PtrToStructure(buffer, typeof(Accounting));
        } finally { Marshal.FreeHGlobal(buffer); }
        sample.cpuSeconds = (sample.accounting.TotalUserTime + sample.accounting.TotalKernelTime) / 1e7;
        sample.epochMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        return sample;
    }
    public void Stop() {
        if (!TerminateJobObject(job, 0)) throw Failure();
    }
    public void Dispose() {
        if (root != IntPtr.Zero) { CloseHandle(root); root = IntPtr.Zero; }
        if (job != IntPtr.Zero) { CloseHandle(job); job = IntPtr.Zero; }
    }
}
