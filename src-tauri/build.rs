use std::path::PathBuf;

fn main() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let root = PathBuf::from(&manifest_dir).parent().unwrap().to_path_buf();

    println!("cargo:warning=build.rs: CARGO_MANIFEST_DIR = {}", manifest_dir);
    println!("cargo:warning=build.rs: resolved root = {}", root.display());

    let prod_path = root.join(".env.production");
    let local_path = root.join(".env.local");

    println!("cargo:warning=build.rs: .env.production exists = {}", prod_path.exists());
    println!("cargo:warning=build.rs: .env.local exists = {}", local_path.exists());

    let prod_result = dotenvy::from_path(&prod_path);
    println!("cargo:warning=build.rs: dotenvy load .env.production = {:?}", prod_result.is_ok());
    if let Err(e) = &prod_result {
        println!("cargo:warning=build.rs: dotenvy error: {}", e);
    }

    let local_result = dotenvy::from_path(&local_path);
    println!("cargo:warning=build.rs: dotenvy load .env.local = {:?}", local_result.is_ok());
    if let Err(e) = &local_result {
        println!("cargo:warning=build.rs: dotenvy error: {}", e);
    }

    for key in [
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
        "NEXT_PUBLIC_CLERK_PROXY_URL",
        "CLERK_SECRET_KEY",
    ] {
        match std::env::var(key) {
            Ok(val) => {
                let masked = if val.len() > 10 { format!("{}...{}", &val[..6], &val[val.len()-4..]) } else { "(short)".into() };
                println!("cargo:warning=build.rs: {} = {} (len={})", key, masked, val.len());
                println!("cargo:rustc-env={key}={val}");
            }
            Err(e) => {
                println!("cargo:warning=build.rs: {} NOT SET ({})", key, e);
            }
        }
    }

    tauri_build::build()
}
