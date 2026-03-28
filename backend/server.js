require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Pool } = require('pg');
const Tesseract = require('tesseract.js');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const upload = multer({ storage: multer.memoryStorage() });

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

let _pipeline;
let _env;
let clipVisionModel;
let clipProcessor;
let clipClassifier;
let captionPipeline;
let isAiReady = false;

// Initialize Database & Extension
async function initDB() {
  try {
    const client = await pool.connect();
    // Drop old table (old 512D vectors are incompatible with new 768D CLIP-Large)
    // NOTE: Remove this DROP line after first successful run if you want to keep history
    await client.query('DROP TABLE IF EXISTS search_results;');

    // Create Main Table using standard JSONB for vectors
    await client.query(`
      CREATE TABLE IF NOT EXISTS search_results (
          id SERIAL PRIMARY KEY,
          image_name VARCHAR(255),
          detected_labels JSONB,
          extracted_text TEXT,
          translated_text TEXT,
          image_embedding JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ PostgreSQL Database Initialized (768D CLIP-Large Vectors)');
    client.release();
  } catch (err) {
    console.error('❌ Database Initialization Error:', err.message);
  }
}

// Initialize AI Models via dynamic import
async function initAI() {
  try {
    console.log('⏳ Downloading & Loading HIGH-ACCURACY AI Models... (First run: ~2-5 min download, after that instant)');
    const transformers = await import('@xenova/transformers');
    _pipeline = transformers.pipeline;
    _env = transformers.env;

    // Run completely offline (cache local models)
    _env.allowLocalModels = false;

    // 1. CLIP ViT-Large/14 — 768D vectors, MUCH more accurate than base/32
    console.log('⏳ [1/3] Loading CLIP ViT-Large/14 (Best Accuracy Vision Model)...');
    const { CLIPVisionModelWithProjection, AutoProcessor } = await import('@xenova/transformers');
    clipVisionModel = await CLIPVisionModelWithProjection.from_pretrained('Xenova/clip-vit-large-patch14');
    clipProcessor = await AutoProcessor.from_pretrained('Xenova/clip-vit-large-patch14');

    // 2. CLIP ViT-Large/14 for zero-shot labels (same model = consistent)
    console.log('⏳ [2/3] Loading CLIP Zero-Shot Classifier (Large)...');
    clipClassifier = await _pipeline('zero-shot-image-classification', 'Xenova/clip-vit-large-patch14');

    // 3. Image Captioning — vit-gpt2 (confirmed public, no auth needed)
    console.log('⏳ [3/3] Loading Image Captioning AI...');
    captionPipeline = await _pipeline('image-to-text', 'Xenova/vit-gpt2-image-captioning');

    isAiReady = true;
    console.log('✅ ALL AI Models Loaded (CLIP-Large + Caption) — Maximum Accuracy Mode!');
  } catch (error) {
    console.error('❌ Error Loading AI Models:', error);
  }
}

initDB();
initAI();

// Labels taxonomy for zero-shot classification (120+ items for high accuracy)
const candidate_labels = [
  // Electronics & Devices
  "laptop", "desktop computer", "keyboard", "mechanical keyboard", "mouse", "computer monitor",
  "smartphone", "tablet", "smartwatch", "headphones", "earbuds", "speaker", "microphone",
  "camera", "webcam", "printer", "router", "USB cable", "charger", "power bank",
  "television", "remote control", "game controller", "gaming console", "VR headset",
  // Clothing & Fashion
  "t-shirt", "shirt", "dress shirt", "hoodie", "jacket", "coat", "sweater",
  "jeans", "pants", "shorts", "skirt", "dress",
  "sneakers", "running shoes", "boots", "sandals", "high heels", "slippers",
  "hat", "cap", "beanie", "scarf", "gloves", "belt", "tie", "socks",
  // Accessories
  "sunglasses", "eyeglasses", "watch", "wristwatch", "necklace", "bracelet", "ring", "earrings",
  "handbag", "backpack", "wallet", "umbrella",
  // Furniture & Home
  "chair", "office chair", "sofa", "table", "desk", "bed", "bookshelf", "lamp", "mirror", "clock",
  "pillow", "blanket", "curtain", "rug", "vase",
  // Food & Drink
  "pizza", "burger", "sushi", "rice", "noodles", "bread", "cake", "ice cream", "salad", "sandwich",
  "fruit", "apple", "banana", "coffee", "tea", "juice", "water bottle", "beer", "wine",
  // Animals
  "dog", "cat", "bird", "fish", "hamster", "rabbit", "horse", "cow", "chicken", "butterfly", "snake",
  // Vehicles & Transport
  "car", "truck", "motorcycle", "bicycle", "bus", "train", "airplane", "boat", "scooter",
  // Sports & Outdoors
  "football", "basketball", "tennis ball", "soccer ball", "baseball bat", "golf club",
  "skateboard", "surfboard", "dumbbell", "yoga mat",
  // Office & Stationery
  "book", "notebook", "pen", "pencil", "scissors", "tape", "stapler", "paper",
  "document", "envelope", "credit card", "money", "coin",
  // Tools & Misc
  "wrench", "hammer", "screwdriver", "knife", "key", "lock", "battery",
  "bottle", "cup", "mug", "plate", "fork", "spoon", "chopsticks",
  "toothbrush", "soap", "shampoo", "towel",
  // Music
  "guitar", "piano", "drum", "violin", "microphone stand",
  // Nature & Scenes
  "flower", "tree", "mountain", "beach", "sunset", "sky", "building", "bridge", "road"
];

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ai_ready: isAiReady });
});

// History endpoint
app.get('/api/history', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, image_name, detected_labels, extracted_text, translated_text, created_at FROM search_results ORDER BY created_at DESC LIMIT 50');
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/analyze', upload.single('image'), async (req, res) => {
  if (!isAiReady) {
    return res.status(503).json({ error: 'AI models are still loading in the background...' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }

  const fileName = req.file.originalname || `capture_${Date.now()}.jpg`;

  try {
    console.log(`\n📷 Starting Full-Stack Analysis for: ${fileName}`);

    console.log(`🖼️ Decoding raw image buffer for AI (using Jimp - pure JS)...`);
    const Jimp = require('jimp');
    const { RawImage } = await import('@xenova/transformers');

    const jimpImage = await Jimp.read(req.file.buffer);
    const w = jimpImage.bitmap.width;
    const h = jimpImage.bitmap.height;
    // Jimp bitmap.data is RGBA, we need RGB only
    const rgbaData = jimpImage.bitmap.data; // Uint8Array of RGBA
    const rgbData = new Uint8ClampedArray(w * h * 3);
    for (let i = 0, j = 0; i < rgbaData.length; i += 4, j += 3) {
      rgbData[j] = rgbaData[i];     // R
      rgbData[j + 1] = rgbaData[i + 1]; // G
      rgbData[j + 2] = rgbaData[i + 2]; // B
    }

    // Build the RawImage object native to Transformers.js
    const rawImage = new RawImage(rgbData, w, h, 3);

    // 1. AI Image Captioning (full English description)
    console.log(`🧠 Generating AI Caption (image-to-text)...`);
    const captionResult = await captionPipeline(rawImage);
    const caption = captionResult[0]?.generated_text || '';
    console.log(`📝 AI Caption: "${caption}"`);

    // 2. AI Object & Scene Recognition (Zero-shot labels for badges)
    console.log(`🤖 Running CLIP Model (Labels) on Native Frame...`);
    const classifications = await clipClassifier(rawImage, candidate_labels);
    const topLabels = classifications.slice(0, 5).map(c => ({ description: c.label, score: c.score }));

    // 2. AI Vector Embeddings (512D) via CLIP Vision Model
    console.log(`🤖 Generating CLIP Embedding (512D Vector)...`);
    const imageInputs = await clipProcessor(rawImage);
    const { image_embeds } = await clipVisionModel(imageInputs);
    // Convert Float32Array to standard JS Array
    const vectorArray = Array.from(image_embeds.data);

    // 3. OCR (Text Extraction)
    console.log(`📝 Running Offline OCR (Tesseract.js)...`);
    const tesseractResult = await Tesseract.recognize(req.file.buffer, 'eng');
    const extractedText = tesseractResult.data.text.trim();

    // 4. Translate Text (LibreTranslate)
    console.log(`🌍 Translating Text (via LibreTranslate)...`);
    let translatedText = '';
    if (extractedText) {
      // Use self-hosted LibreTranslate URL if provided in .env
      const libreEndpoint = process.env.LIBRETRANSLATE_URL || 'http://localhost:5000/translate';
      try {
        const trRes = await fetch(libreEndpoint, {
          method: 'POST',
          body: JSON.stringify({ q: extractedText, source: 'auto', target: 'th', format: 'text' }),
          headers: { 'Content-Type': 'application/json' }
        });
        if (trRes.ok) {
          const trData = await trRes.json();
          translatedText = trData.translatedText || '';
        } else {
          translatedText = `(LibreTranslate Offline) ${extractedText}`;
        }
      } catch (err) {
        console.log("LibreTranslate fetch failed (container likely not running):", err.message);
        translatedText = `(Translation API Offline) ${extractedText}`;
      }
    }

    // 5. Reverse Image Search (Native JavaScript Math Fallback for pgvector)
    console.log(`🔍 Searching Database for visually similar past scans...`);
    const allScansResult = await pool.query(`SELECT id, image_name, detected_labels, extracted_text, image_embedding FROM search_results`);

    // Mathematical Cosine Similarity function for Vectors
    function cosineSimilarity(A, B) {
      let dotProduct = 0, normA = 0, normB = 0;
      for (let i = 0; i < A.length; i++) {
        dotProduct += A[i] * B[i];
        normA += A[i] * A[i];
        normB += B[i] * B[i];
      }
      return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    let visuallySimilar = [];
    if (allScansResult.rows.length > 0) {
      // Calculate Cosine Similarity against all past vectors in DB
      const scoredScans = allScansResult.rows.map(row => {
        const dbVec = typeof row.image_embedding === 'string' ? JSON.parse(row.image_embedding) : row.image_embedding;
        const score = cosineSimilarity(vectorArray, dbVec);
        return { ...row, similarity_score: score };
      });

      // Sort descending by highest similarity (ignore exact 1.0 match if it's the exact same scan theoretically, but for now just sort)
      scoredScans.sort((a, b) => b.similarity_score - a.similarity_score);
      visuallySimilar = scoredScans.slice(0, 3); // top 3
    }

    // 6. Save to Database
    console.log(`💾 Saving current scan to database...`);
    await pool.query(
      'INSERT INTO search_results (image_name, detected_labels, extracted_text, translated_text, image_embedding) VALUES ($1, $2, $3, $4, $5)',
      [fileName, JSON.stringify(topLabels), extractedText, translatedText, JSON.stringify(vectorArray)]
    );

    // 7. Search MULTIPLE web sources using CLIP LABELS (more accurate than caption)
    const label1 = topLabels[0]?.description || 'unknown';
    const label2 = topLabels[1]?.description || '';
    const searchQuery = label2 ? `${label1} ${label2}` : label1;
    console.log(`🌐 Searching multiple sources for: "${searchQuery}" (caption was: "${caption}")`);

    let webResults = [];

    // Source 1: Wikipedia (articles + thumbnails) — 6 results
    const wikiSearch = async () => {
      try {
        const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages|extracts&generator=search&gsrsearch=${encodeURIComponent(searchQuery)}&gsrlimit=6&pithumbsize=400&exchars=200&exintro=1&explaintext=1`;
        const res = await fetch(wikiUrl);
        const data = await res.json();
        if (data.query && data.query.pages) {
          return Object.values(data.query.pages).map(page => ({
            title: page.title,
            link: `https://en.wikipedia.org/?curid=${page.pageid}`,
            snippet: page.extract || '',
            image: page.thumbnail ? page.thumbnail.source : null,
            source: 'Wikipedia'
          }));
        }
      } catch (e) { console.log('Wiki skip:', e.message); }
      return [];
    };

    // Source 2: DuckDuckGo Instant Answer API — up to 10 results
    const ddgSearch = async () => {
      try {
        const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(searchQuery + ' product')}&format=json&no_html=1&skip_disambig=1`;
        const res = await fetch(ddgUrl);
        const data = await res.json();
        const results = [];
        if (data.AbstractText && data.AbstractURL) {
          results.push({
            title: data.Heading || searchQuery,
            link: data.AbstractURL,
            snippet: data.AbstractText.slice(0, 200),
            image: data.Image ? (data.Image.startsWith('http') ? data.Image : `https://duckduckgo.com${data.Image}`) : null,
            source: 'DuckDuckGo'
          });
        }
        if (data.RelatedTopics) {
          for (const topic of data.RelatedTopics.slice(0, 8)) {
            if (topic.Text && topic.FirstURL) {
              results.push({
                title: topic.Text.slice(0, 80),
                link: topic.FirstURL,
                snippet: topic.Text.slice(0, 150),
                image: topic.Icon?.URL ? (topic.Icon.URL.startsWith('http') ? topic.Icon.URL : `https://duckduckgo.com${topic.Icon.URL}`) : null,
                source: 'DuckDuckGo'
              });
            }
            // Nested sub-topics
            if (topic.Topics) {
              for (const sub of topic.Topics.slice(0, 3)) {
                if (sub.Text && sub.FirstURL) {
                  results.push({
                    title: sub.Text.slice(0, 80),
                    link: sub.FirstURL,
                    snippet: sub.Text.slice(0, 150),
                    image: sub.Icon?.URL ? (sub.Icon.URL.startsWith('http') ? sub.Icon.URL : `https://duckduckgo.com${sub.Icon.URL}`) : null,
                    source: 'DuckDuckGo'
                  });
                }
              }
            }
          }
        }
        return results;
      } catch (e) { console.log('DDG skip:', e.message); }
      return [];
    };

    // Source 3: Openverse (Creative Commons free images — NO API KEY needed!)
    const openverseSearch = async () => {
      try {
        const ovUrl = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(searchQuery)}&page_size=6`;
        const res = await fetch(ovUrl, {
          headers: { 'User-Agent': 'VisionAI-App/1.0 (student project)' }
        });
        const data = await res.json();
        if (data.results) {
          return data.results.map(img => ({
            title: img.title || searchQuery,
            link: img.foreign_landing_url || img.url,
            snippet: `by ${img.creator || 'Unknown'} • ${img.source || 'Openverse'}`,
            image: img.thumbnail || img.url,
            source: 'Openverse'
          }));
        }
      } catch (e) { console.log('Openverse skip:', e.message); }
      return [];
    };

    // Source 4: Wikimedia Commons (free media files — NO API KEY needed!)
    const commonsSearch = async () => {
      try {
        const cmUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(searchQuery)}&gsrlimit=6&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=400`;
        const res = await fetch(cmUrl);
        const data = await res.json();
        if (data.query && data.query.pages) {
          return Object.values(data.query.pages)
            .filter(p => p.imageinfo && p.imageinfo[0])
            .map(page => ({
              title: page.title.replace('File:', '').replace(/\.[^.]+$/, ''),
              link: `https://commons.wikimedia.org/?curid=${page.pageid}`,
              snippet: page.imageinfo[0]?.extmetadata?.ImageDescription?.value?.replace(/<[^>]*>/g, '').slice(0, 120) || 'Free image from Wikimedia Commons',
              image: page.imageinfo[0]?.thumburl || page.imageinfo[0]?.url,
              source: 'Wikimedia'
            }));
        }
      } catch (e) { console.log('Commons skip:', e.message); }
      return [];
    };

    // Execute all 4 searches in parallel for maximum speed
    const [wikiResults, ddgResults, openverseResults, commonsResults] = await Promise.all([
      wikiSearch(), ddgSearch(), openverseSearch(), commonsSearch()
    ]);
    webResults = [...openverseResults, ...commonsResults, ...wikiResults, ...ddgResults];
    console.log(`Found ${webResults.length} total results from 4 sources`);

    // 8. Return Result Payload
    const responsePayload = {
      image_name: fileName,
      caption: caption,
      labels: topLabels,
      ocr_text: extractedText,
      translated_text: translatedText,
      similar_images: visuallySimilar,
      web_results: webResults
    };

    console.log("✅ Analysis Complete!\n");
    res.json(responsePayload);

  } catch (error) {
    console.error('❌ Search/Analyze API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Offline AI Backend listening on port ${PORT}`);
});
