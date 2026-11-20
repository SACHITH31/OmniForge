package com.omniforge.qa;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.os.Bundle;
import android.widget.TextView;
import java.io.InputStream;
import java.security.MessageDigest;

/** Installed only in emulator CI. Confirms a separate UID can read the granted file. */
public class ReceiverActivity extends Activity {
  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    TextView status = new TextView(this);
    status.setPadding(24, 32, 24, 24);
    setContentView(status);
    try {
      Intent intent = getIntent();
      boolean share = Intent.ACTION_SEND.equals(intent.getAction());
      Uri uri = share ? intent.getParcelableExtra(Intent.EXTRA_STREAM) : intent.getData();
      if (uri == null || !"content".equals(uri.getScheme())) throw new IllegalArgumentException("Expected a content URI");
      if ("image/png".equals(intent.getType())) {
        try (InputStream bytes = getContentResolver().openInputStream(uri)) {
          BitmapFactory.Options info = new BitmapFactory.Options();
          Bitmap image = BitmapFactory.decodeStream(bytes, null, info);
          if (image == null) throw new IllegalStateException("Could not decode bitmap");
          try {
            if (!"image/png".equals(info.outMimeType) || image.getWidth() != 1350 || image.getHeight() != 1800 ||
                image.getPixel(270, 1530) != Color.BLUE || image.getPixel(1200, 200) != Color.WHITE) {
              throw new IllegalStateException("Wrong page or encoding");
            }
            status.setText("QA received Open PNG 1350x1800 blue rectangle on white");
          } finally { image.recycle(); }
        }
        return;
      }
      if (!"image/jpeg".equals(intent.getType())) throw new IllegalArgumentException("Expected JPEG");
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      try (InputStream bytes = getContentResolver().openInputStream(uri)) {
        byte[] buffer = new byte[8192];
        int count;
        while ((count = bytes.read(buffer)) != -1) digest.update(buffer, 0, count);
      }
      StringBuilder hash = new StringBuilder();
      for (byte value : digest.digest()) hash.append(String.format("%02x", value & 0xff));
      status.setText("QA received " + (share ? "Share " : "Open ") + hash);
    } catch (Exception error) {
      status.setText("QA receiver error: " + error.getClass().getSimpleName());
    }
  }
}
