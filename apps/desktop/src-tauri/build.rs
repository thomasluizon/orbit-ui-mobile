fn main() {
    println!("cargo:rerun-if-changed=native");
    println!("cargo:rerun-if-env-changed=ORBIT_DESKTOP_WNS_OBJECT_ID");
    match std::env::var("CARGO_CFG_TARGET_OS").unwrap().as_str() {
        "macos" => {
            cc::Build::new()
                .file("native/macos/push.m")
                .flag("-fobjc-arc")
                .flag("-fblocks")
                .flag("-mmacosx-version-min=10.13")
                .compile("orbit_push");
            for framework in ["AppKit", "Security"] {
                println!("cargo:rustc-link-lib=framework={framework}");
            }
            println!("cargo:rustc-link-arg=-Wl,-weak_framework,UserNotifications");
        }
        "windows" => build_windows(),
        _ => panic!("Desktop push requires macOS or Windows"),
    }
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "commit_desktop_login",
            "desktop_push",
            "desktop_update",
        ]),
    ))
    .expect("cannot build desktop context")
}

fn build_windows() {
    let output = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap());
    let architecture = match std::env::var("CARGO_CFG_TARGET_ARCH").unwrap().as_str() {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        _ => panic!("Unsupported Windows architecture"),
    };
    let status = std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            "native/windows/prepare.ps1",
            "-Architecture",
            architecture,
            "-Output",
        ])
        .arg(&output)
        .status()
        .expect("cannot prepare Windows App SDK");
    assert!(status.success(), "Windows App SDK preparation failed");
    cc::Build::new()
        .cpp(true)
        .std("c++20")
        .file("native/windows/push.cpp")
        .include(output.join("projection"))
        .include(output.join("sdk/include"))
        .flag("/EHsc")
        .compile("orbit_push");
    println!("cargo:rustc-link-lib=windowsapp");
    println!("cargo:rustc-link-lib=ole32");
    println!(
        "cargo:rustc-env=ORBIT_WNS_BOOTSTRAP={}",
        output
            .join("sdk/runtimes")
            .join(format!(
                "win-{architecture}/native/Microsoft.WindowsAppRuntime.Bootstrap.dll"
            ))
            .display()
    );
    println!(
        "cargo:rustc-env=ORBIT_WNS_INSTALLER={}",
        output.join("WindowsAppRuntimeInstall.exe").display()
    );
}
