const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use(express.static(__dirname));

app.post('/api/unshorten', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return res.status(400).json({ success: false, error: 'URL tidak valid.' });
  }

  try {
    let finalUrl = null;
    let logs = [];

    // TAHAP 1: Pakai Engine Bypass Khusus Safelink (Nembus Cloudflare/sfl.gl)
    try {
      const api1 = await fetch(`https://api.bypass.vip/bypass?url=${encodeURIComponent(url)}`);
      const data1 = await api1.json();
      if (data1 && data1.destination && data1.destination !== url) {
        finalUrl = data1.destination;
        logs.push(`[Bypass Engine VIP]: ${finalUrl}`);
      }
    } catch (e) {}

    // TAHAP 2: Jika Tahap 1 Gagal, Pakai Backup Engine 2
    if (!finalUrl || finalUrl === url) {
      try {
        const api2 = await fetch(`https://unshorten.me/json/${encodeURIComponent(url)}`);
        const data2 = await api2.json();
        if (data2 && data2.resolved_url && data2.resolved_url !== url) {
          finalUrl = data2.resolved_url;
          logs.push(`[Unshorten Engine]: ${finalUrl}`);
        }
      } catch (e) {}
    }

    // TAHAP 3: Scanning HTML jika berupa link pengalihan biasa
    if (!finalUrl || finalUrl === url) {
      try {
        const resp = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36'
          },
          redirect: 'follow'
        });
        
        if (resp.url && resp.url !== url) {
          finalUrl = resp.url;
          logs.push(`[Direct Redirect]: ${finalUrl}`);
        }

        const html = await resp.text();
        const targetMatch = html.match(/https?:\/\/(www\.)?(mediafire\.com|drive\.google\.com|mega\.nz)\/[^\s"'<>]+/i);
        if (targetMatch?.[0]) {
          finalUrl = targetMatch[0].replace(/&amp;/g, '&');
          logs.push(`[Target Extracted]: ${finalUrl}`);
        }
      } catch (e) {}
    }

    // Jika semua cara gagal karena Cloudflare CAPTCHA keras
    if (!finalUrl || finalUrl === url) {
      return res.json({
        success: false,
        error: 'Safelink ini menggunakan proteksi CAPTCHA/Cloudflare tinggi yang tidak bisa dilewati server.'
      });
    }

    return res.json({
      success: true,
      finalUrl: finalUrl,
      chain: logs
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: 'Gagal memproses: ' + err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server aktif`));

module.exports = app;
