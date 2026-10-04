const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

// 1. Tampilkan index.html pada rute utama (Anti 'Cannot GET /')
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve file statis
app.use(express.static(__dirname));

// Fungsi pembantu dekode Base64
function decodeBase64(str) {
  try {
    const decoded = Buffer.from(str, 'base64').toString('utf-8');
    if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
      return decoded;
    }
  } catch (e) {}
  return null;
}

// Endpoint pemintas link
app.post('/api/unshorten', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return res.status(400).json({ success: false, error: 'URL tidak valid. Masukkan link lengkap.' });
  }

  try {
    let currentUrl = url;
    let logs = [];
    let maxSteps = 10;

    // Tahap A: Cek apakah ada parameter Base64 tersembunyi di dalam URL safelink
    try {
      const parsed = new URL(currentUrl);
      for (const [key, val] of parsed.searchParams.entries()) {
        const decoded = decodeBase64(val);
        if (decoded) {
          currentUrl = decoded;
          logs.push(`[Base64 Param Decoded]: ${currentUrl}`);
          break;
        }
      }
    } catch (e) {}

    // Tahap B: Tracking Redirect & Ekstraksi Link MediaFire dari HTML
    while (maxSteps > 0 && !currentUrl.includes('mediafire.com') && !currentUrl.includes('drive.google.com') && !currentUrl.includes('mega.nz')) {
      maxSteps--;

      const response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      // Cek pengalihan HTTP Header (301/302)
      const location = response.headers.get('location');
      if (location) {
        currentUrl = new URL(location, currentUrl).href;
        logs.push(`[HTTP Redirect]: ${currentUrl}`);
        continue;
      }

      // Scan isi HTML untuk mencari link MediaFire / Target
      const html = await response.text();

      const mfMatch = html.match(/https?:\/\/(www\.)?mediafire\.com\/[^\s"'<>]+/i);
      const gdMatch = html.match(/https?:\/\/drive\.google\.com\/[^\s"'<>]+/i);
      const mgMatch = html.match(/https?:\/\/mega\.nz\/[^\s"'<>]+/i);

      const targetFound = mfMatch?.[0] || gdMatch?.[0] || mgMatch?.[0];

      if (targetFound) {
        currentUrl = targetFound.replace(/&amp;/g, '&');
        logs.push(`[Target MediaFire Found]: ${currentUrl}`);
        break;
      }

      // Cek pengalihan JavaScript (location.href)
      const jsMatch = html.match(/(?:window\.location|location\.href)\s*=\s*["']([^"']+)["']/i);
      if (jsMatch && jsMatch[1] && jsMatch[1] !== currentUrl) {
        let nextUrl = jsMatch[1].replace(/&amp;/g, '&');
        if (!nextUrl.startsWith('http')) nextUrl = new URL(nextUrl, currentUrl).href;
        currentUrl = nextUrl;
        logs.push(`[JS Redirect]: ${currentUrl}`);
        continue;
      }

      break;
    }

    // Tahap C: Fallback menggunakan API Bypass Engine jika masih berupa safelink
    if (!currentUrl.includes('mediafire.com') && !currentUrl.includes('drive.google.com')) {
      try {
        const apiRes = await fetch(`https://unshorten.me/json/${encodeURIComponent(url)}`);
        const apiData = await apiRes.json();
        if (apiData && apiData.resolved_url && apiData.resolved_url !== url) {
          currentUrl = apiData.resolved_url;
          logs.push(`[External Bypass Engine]: ${currentUrl}`);
        }
      } catch (e) {}
    }

    return res.json({
      success: true,
      finalUrl: currentUrl,
      chain: logs
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: 'Gagal mengekstrak: ' + err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server aktif di port ${PORT}`));

module.exports = app;
