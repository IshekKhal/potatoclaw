use std::fs;
use std::path::PathBuf;
use chrono::Local;
use image::imageops::crop_imm;
use image::RgbaImage;
use xcap::Monitor;

#[cfg(windows)]
fn capture_win32_gdi(x: i32, y: i32, width: u32, height: u32) -> Result<RgbaImage, String> {
    use windows::core::{w, PCWSTR};
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreateDCW, DeleteDC, DeleteObject,
        GetDIBits, SelectObject, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS, SRCCOPY,
    };
    use windows::Win32::System::StationsAndDesktops::{
        OpenInputDesktop, SetThreadDesktop, DESKTOP_ACCESS_FLAGS, DESKTOP_CONTROL_FLAGS,
    };

    if width == 0 || height == 0 {
        return Err("Capture region dimensions must be greater than zero".to_string());
    }

    unsafe {
        // Attach thread to active input desktop if accessible
        if let Ok(input_desk) = OpenInputDesktop(
            DESKTOP_CONTROL_FLAGS(0),
            false,
            DESKTOP_ACCESS_FLAGS(0x01ff),
        ) {
            let _ = SetThreadDesktop(input_desk);
        }

        let display_dc = CreateDCW(w!("DISPLAY"), PCWSTR::null(), PCWSTR::null(), None);
        if display_dc.0.is_null() {
            return Err("Failed to create DISPLAY device context".to_string());
        }

        let mem_dc = CreateCompatibleDC(Some(display_dc));
        if mem_dc.0.is_null() {
            let _ = DeleteDC(display_dc);
            return Err("Failed to create memory device context".to_string());
        }

        let h_bitmap = CreateCompatibleBitmap(display_dc, width as i32, height as i32);
        if h_bitmap.0.is_null() {
            let _ = DeleteDC(mem_dc);
            let _ = DeleteDC(display_dc);
            return Err("Failed to create compatible bitmap".to_string());
        }

        let old_obj = SelectObject(mem_dc, h_bitmap.into());

        let blt_res = BitBlt(
            mem_dc,
            0,
            0,
            width as i32,
            height as i32,
            Some(display_dc),
            x,
            y,
            SRCCOPY,
        );

        // Deselect bitmap BEFORE calling GetDIBits to avoid 0x80070006 (ERROR_INVALID_HANDLE)
        SelectObject(mem_dc, old_obj);

        if blt_res.is_err() {
            let _ = DeleteObject(h_bitmap.into());
            let _ = DeleteDC(mem_dc);
            let _ = DeleteDC(display_dc);
            return Err("BitBlt screen copy failed".to_string());
        }

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width as i32,
                biHeight: -(height as i32), // Top-down DIB
                biPlanes: 1,
                biBitCount: 32,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut buf = vec![0u8; (width * height * 4) as usize];
        let lines_copied = GetDIBits(
            mem_dc,
            h_bitmap,
            0,
            height,
            Some(buf.as_mut_ptr().cast()),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        let _ = DeleteObject(h_bitmap.into());
        let _ = DeleteDC(mem_dc);
        let _ = DeleteDC(display_dc);

        if lines_copied == 0 {
            return Err("GetDIBits failed to copy scanlines".to_string());
        }

        // Convert BGRA to RGBA in place
        for chunk in buf.chunks_exact_mut(4) {
            chunk.swap(0, 2); // swap B and R
            chunk[3] = 255;   // set full alpha
        }

        RgbaImage::from_raw(width, height, buf)
            .ok_or_else(|| "Failed to construct RgbaImage from GDI buffer".to_string())
    }
}

fn capture_xcap(x: u32, y: u32, width: u32, height: u32) -> Result<RgbaImage, String> {
    let monitors = Monitor::all().map_err(|e| format!("Failed to list monitors: {e}"))?;
    if monitors.is_empty() {
        return Err("No monitors detected on system".to_string());
    }

    let primary_idx = monitors
        .iter()
        .position(|m| m.is_primary().unwrap_or(false))
        .unwrap_or(0);
    let monitor = &monitors[primary_idx];

    let img = monitor
        .capture_image()
        .map_err(|e| format!("Failed to capture monitor image: {e}"))?;

    let img_w = img.width();
    let img_h = img.height();

    if img_w == 0 || img_h == 0 {
        return Err("Captured screen has zero dimensions".to_string());
    }

    let crop_x = x.min(img_w.saturating_sub(1));
    let crop_y = y.min(img_h.saturating_sub(1));
    let crop_w = width.min(img_w.saturating_sub(crop_x)).max(1);
    let crop_h = height.min(img_h.saturating_sub(crop_y)).max(1);

    Ok(crop_imm(&img, crop_x, crop_y, crop_w, crop_h).to_image())
}

/// Captures a specified rectangular region and saves it as a PNG in temporary storage.
/// Returns the absolute path of the saved screenshot.
pub fn capture_screen_region(x: u32, y: u32, width: u32, height: u32) -> Result<String, String> {
    #[cfg(windows)]
    let image_result = capture_win32_gdi(x as i32, y as i32, width, height)
        .or_else(|_gdi_err| capture_xcap(x, y, width, height));

    #[cfg(not(windows))]
    let image_result = capture_xcap(x, y, width, height);

    let cropped = image_result?;

    // Prepare destination folder in temp directory
    let snips_dir: PathBuf = std::env::temp_dir().join("potatoclaw_snips");
    fs::create_dir_all(&snips_dir)
        .map_err(|e| format!("Failed to create snips directory '{:?}': {e}", snips_dir))?;

    let timestamp = Local::now().format("%Y%m%d_%H%M%S");
    let filename = format!("snip_{}.png", timestamp);
    let file_path = snips_dir.join(filename);

    cropped
        .save(&file_path)
        .map_err(|e| format!("Failed to save cropped screenshot to '{:?}': {e}", file_path))?;

    Ok(file_path.to_string_lossy().to_string())
}
