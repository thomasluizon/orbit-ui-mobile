export function cpuSeconds(value) {
  const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(value)
  if (!match) throw new Error(`Invalid CPU time: ${value}`)
  return Number(match[1] ?? 0) * 86400 + Number(match[2] ?? 0) * 3600 + Number(match[3]) * 60 + Number(match[4])
}

export function parseMacProcesses(stdout) {
  return stdout.trim().split('\n').filter(Boolean).map((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/.exec(line)
    if (!match) throw new Error(`Invalid process row: ${line}`)
    return { pid: Number(match[1]), parent: Number(match[2]), residentBytes: Number(match[3]) * 1024, cpuSeconds: cpuSeconds(match[4]), command: match[5] }
  })
}

export function processTree(processes, rootPid) {
  const owned = new Set([rootPid])
  let size = 0
  while (size !== owned.size) {
    size = owned.size
    for (const entry of processes) {
      if (owned.has(entry.parent) || owned.has(entry.responsible)) owned.add(entry.pid)
    }
  }
  return processes.filter((entry) => owned.has(entry.pid))
}

export function percentile(values, fraction) {
  if (!values.length || values.some((value) => !Number.isFinite(value) || value < 0)) throw new Error('Expected finite nonnegative measurements')
  return [...values].sort((left, right) => left - right)[Math.max(0, Math.ceil(values.length * fraction) - 1)]
}

export function median(values) {
  percentile(values, 0.5)
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export const metrics = {
  startupMs: 'First usable Hoje (ms)',
  resident10Bytes: 'Process RSS at 10 s (bytes)',
  resident60Bytes: 'Process RSS at 60 s idle (bytes)',
  idleCpuSeconds: 'Process CPU over 60 s idle (seconds)',
  scrollP95Ms: 'Scroll frame p95 (ms)',
  scrollSlowFrames: 'Scroll frames over 16.7 ms',
  firstTokenMs: 'Astra first rendered token (ms)',
  finalPartMs: 'Astra final rendered part (ms)',
}

export function summarize(runs) {
  return Object.fromEntries(['tauri', 'electron'].map((shell) => [shell,
    Object.fromEntries(['cold', 'warm'].map((cache) => {
      const selected = runs.filter((run) => run.shell === shell && run.cache === cache)
      if (selected.length < 5) throw new Error(`At least five ${cache} runs required for ${shell}`)
      return [cache, Object.fromEntries(Object.keys(metrics).map((key) => [key, median(selected.map((run) => run[key]))]))]
    })),
  ]))
}

export function markdown(report) {
  const rows = Object.entries(metrics).map(([key, label]) => {
    const cells = ['cold', 'warm'].flatMap((cache) => ['tauri', 'electron'].map((shell) => report.medians[shell][cache][key].toFixed(2)))
    return `| ${label} | ${cells.join(' | ')} |`
  })
  const disk = ['tauri', 'electron'].map((shell) => `| ${shell} | ${report.disk[shell].installedBytes} | ${report.disk[shell].installerBytes} |`)
  return `# Orbit desktop measurements\n\n${report.host}\n\nCommit: ${report.commit}. Electron: ${report.electronVersion}. Runs per cache state: ${report.repetitions}.\n\nUnsigned release builds. Signing does not change runtime cost. Cold means fresh webview storage and HTTP cache; warm reuses that run's storage after a complete process exit. OS filesystem caches are not purged. Both load the same prewarmed hermetic server.\n\n| Metric | Tauri cold | Electron cold | Tauri warm | Electron warm |\n| --- | ---: | ---: | ---: | ---: |\n${rows.join('\n')}\n\n| Disk (logical bytes) | Installed bundle | DMG or installer |\n| --- | ---: | ---: |\n${disk.join('\n')}\n\nIdle CPU is a whole-process-tree CPU-time proxy for energy, not watts. Raw process membership and samples are in JSON. Frame timing covers a fixed 120 px per animation-frame traversal of 200 habits. Astra uses 80 ms fixture pacing through the real composer and BFF.\n\n${report.verdict}\n`
}
