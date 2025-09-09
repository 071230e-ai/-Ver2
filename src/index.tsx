import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { renderer } from './renderer'

// Type definitions for Cloudflare bindings
type Bindings = {
  DB: D1Database;
  R2: R2Bucket;
  AUTH_PASSWORD?: string;
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS for API routes
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// Use JSX renderer
app.use(renderer)

// Authentication configuration
const DEFAULT_PASSWORD = 'meishi2024' // デフォルトパスワード

// Japanese text conversion utilities
function hiraganaToKatakana(str: string): string {
  return str.replace(/[\u3041-\u3096]/g, (char) => 
    String.fromCharCode(char.charCodeAt(0) + 0x60)
  )
}

function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30a1-\u30f6]/g, (char) => 
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  )
}

// Common Japanese name reading mappings
const nameReadings: { [key: string]: string[] } = {
  'たなか': ['田中', 'タナカ'],
  'さとう': ['佐藤', 'サトウ'],
  'やまだ': ['山田', 'ヤマダ'],
  'すずき': ['鈴木', 'スズキ'],
  'たかはし': ['高橋', 'タカハシ'],
  'はなこ': ['花子', 'ハナコ'],
  'たろう': ['太郎', 'タロウ'],
  'じろう': ['次郎', 'ジロウ'],
  'みさき': ['美咲', 'ミサキ'],
  'けんいち': ['健一', 'ケンイチ'],
  // Company name readings
  'てっく': ['テック'],
  'いのべーと': ['イノベート'],
  'でざいん': ['デザイン'],
  'まーけてぃんぐ': ['マーケティング'],
  'そりゅーしょん': ['ソリューション'],
  // Tag readings
  'えいぎょう': ['営業'],
  'ぎじゅつ': ['技術'],
  'かんりしょく': ['管理職'],
  'ぱーとなー': ['パートナー'],
  'こきゃく': ['顧客'],
  'じゅうよう': ['重要']
}

// Reverse mapping (kanji/katakana to hiragana)
const reverseNameReadings: { [key: string]: string[] } = {}
Object.entries(nameReadings).forEach(([hiragana, variations]) => {
  variations.forEach(variation => {
    if (!reverseNameReadings[variation]) {
      reverseNameReadings[variation] = []
    }
    reverseNameReadings[variation].push(hiragana)
  })
})

function generateSearchVariants(search: string): string[] {
  const variants = [search]
  
  // Add hiragana to katakana conversion
  const katakana = hiraganaToKatakana(search)
  if (katakana !== search) variants.push(katakana)
  
  // Add katakana to hiragana conversion  
  const hiragana = katakanaToHiragana(search)
  if (hiragana !== search) variants.push(hiragana)
  
  // Add name reading conversions
  const lowerSearch = search.toLowerCase()
  
  // If search is hiragana, add corresponding kanji/katakana
  if (nameReadings[lowerSearch]) {
    variants.push(...nameReadings[lowerSearch])
  }
  
  // If search is kanji/katakana, add corresponding hiragana
  if (reverseNameReadings[search]) {
    variants.push(...reverseNameReadings[search])
  }
  
  // Check for partial matches in names
  Object.entries(nameReadings).forEach(([hiraganaKey, kanjiValues]) => {
    if (lowerSearch.includes(hiraganaKey) || hiraganaKey.includes(lowerSearch)) {
      variants.push(...kanjiValues)
    }
    kanjiValues.forEach(kanjiValue => {
      if (search.includes(kanjiValue) || kanjiValue.includes(search)) {
        variants.push(hiraganaKey)
      }
    })
  })
  
  return [...new Set(variants)] // Remove duplicates
}

// Authentication API Routes
app.post('/api/auth/login', async (c) => {
  try {
    const { password } = await c.req.json()
    
    if (!password) {
      return c.json({ error: 'Password is required' }, 400)
    }

    // Get password from environment variable or use default
    const authPassword = c.env?.AUTH_PASSWORD || DEFAULT_PASSWORD
    
    if (password === authPassword) {
      // Generate simple session token (you can make this more secure)
      const sessionToken = btoa(`meishi-session-${Date.now()}-${Math.random()}`)
      
      return c.json({ 
        success: true, 
        message: 'Authentication successful',
        token: sessionToken
      })
    } else {
      return c.json({ error: 'Invalid password' }, 401)
    }
  } catch (error) {
    console.error('Authentication error:', error)
    return c.json({ error: 'Authentication failed' }, 500)
  }
})

// Session validation endpoint
app.get('/api/auth/validate', async (c) => {
  const authHeader = c.req.header('Authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ valid: false }, 401)
  }
  
  // Simple token validation (in production, you'd validate against a database or JWT)
  const token = authHeader.substring(7)
  if (token && token.startsWith('bWVpc2hpLXNlc3Npb24t')) { // base64 encoded "meishi-session-"
    return c.json({ valid: true })
  }
  
  return c.json({ valid: false }, 401)
})

// Business Cards API Routes
app.get('/api/cards', async (c) => {
  const { DB } = c.env
  const { search, limit = '50', offset = '0' } = c.req.query()

  // If no database is configured, return in-memory data
  if (!DB) {
    let filteredCards = inMemoryCards

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase()
      filteredCards = inMemoryCards.filter(card => 
        card.name.toLowerCase().includes(searchLower) ||
        card.company.toLowerCase().includes(searchLower) ||
        card.department?.toLowerCase().includes(searchLower) ||
        card.position?.toLowerCase().includes(searchLower) ||
        card.notes?.toLowerCase().includes(searchLower) ||
        (card.tags && card.tags.some((tag: string) => tag.toLowerCase().includes(searchLower)))
      )
    }

    // Apply pagination
    const startIndex = parseInt(offset)
    const limitNum = parseInt(limit)
    const paginatedCards = filteredCards.slice(startIndex, startIndex + limitNum)

    return c.json({ 
      cards: paginatedCards,
      total: filteredCards.length,
      message: inMemoryCards.length === 0 ? 'No cards added yet. Database is running in memory mode.' : undefined
    })
  }

  try {
    let query = `
      SELECT 
        bc.*,
        GROUP_CONCAT(t.name) as tags,
        GROUP_CONCAT(t.color) as tag_colors
      FROM business_cards bc
      LEFT JOIN business_card_tags bct ON bc.id = bct.business_card_id
      LEFT JOIN tags t ON bct.tag_id = t.id
    `
    const params = []

    if (search) {
      // Generate search variants (hiragana <-> katakana)
      const searchVariants = generateSearchVariants(search)
      
      // Build dynamic search conditions for all variants
      const searchConditions = searchVariants.map(() => `
        (bc.id IN (
          SELECT rowid FROM business_cards_fts 
          WHERE business_cards_fts MATCH ?
        ) OR 
        bc.name LIKE ? OR 
        bc.company LIKE ? OR
        bc.department LIKE ? OR
        bc.position LIKE ? OR
        bc.notes LIKE ? OR
        bc.id IN (
          SELECT bct.business_card_id 
          FROM business_card_tags bct
          JOIN tags t ON bct.tag_id = t.id
          WHERE t.name LIKE ?
        ))
      `).join(' OR ')
      
      query += ` WHERE (${searchConditions})`
      
      // Add parameters for each search variant (7 parameters per variant now)
      searchVariants.forEach(variant => {
        const likePattern = `%${variant}%`
        params.push(variant, likePattern, likePattern, likePattern, likePattern, likePattern, likePattern)
      })
    }

    query += ` GROUP BY bc.id ORDER BY bc.created_at DESC LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const { results } = await DB.prepare(query).bind(...params).all()

    const cards = results.map((card: any) => ({
      ...card,
      tags: card.tags ? card.tags.split(',') : [],
      tag_colors: card.tag_colors ? card.tag_colors.split(',') : []
    }))

    return c.json({ cards })
  } catch (error) {
    console.error('Error fetching cards:', error)
    return c.json({ error: 'Failed to fetch business cards' }, 500)
  }
})

app.get('/api/cards/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')

  if (!DB) {
    // Handle in-memory storage
    const card = inMemoryCards.find(card => card.id == id)
    
    if (!card) {
      return c.json({ error: 'Business card not found' }, 404)
    }

    return c.json({ card })
  }

  try {
    const { results } = await DB.prepare(`
      SELECT 
        bc.*,
        GROUP_CONCAT(t.name) as tags,
        GROUP_CONCAT(t.color) as tag_colors
      FROM business_cards bc
      LEFT JOIN business_card_tags bct ON bc.id = bct.business_card_id
      LEFT JOIN tags t ON bct.tag_id = t.id
      WHERE bc.id = ?
      GROUP BY bc.id
    `).bind(id).all()

    if (results.length === 0) {
      return c.json({ error: 'Business card not found' }, 404)
    }

    const card = {
      ...results[0],
      tags: results[0].tags ? results[0].tags.split(',') : [],
      tag_colors: results[0].tag_colors ? results[0].tag_colors.split(',') : []
    }

    return c.json({ card })
  } catch (error) {
    console.error('Error fetching card:', error)
    return c.json({ error: 'Failed to fetch business card' }, 500)
  }
})

// In-memory storage for when database is not configured
let inMemoryCards: any[] = []
let inMemoryTags: any[] = []
let inMemoryImages: { [key: string]: { data: string; type: string } } = {}
let cardIdCounter = 1
let tagIdCounter = 1

app.post('/api/cards', async (c) => {
  const { DB } = c.env

  try {
    const cardData = await c.req.json()
    const { 
      name, company, department, position, phone, email, 
      address, website, registered_by = 'admin', notes, tags = [] 
    } = cardData

    if (!name || !company) {
      return c.json({ error: 'Name and company are required' }, 400)
    }

    if (!DB) {
      // Use in-memory storage when database is not configured
      const now = new Date().toISOString()
      const cardId = cardIdCounter++
      
      const newCard = {
        id: cardId,
        name, company, department, position, phone, email,
        address, website, registered_by, notes,
        image_url: null,
        created_at: now,
        updated_at: now,
        tags: tags || [],
        tag_colors: tags.map(() => '#3B82F6')
      }
      
      // Add tags to in-memory tags if they don't exist
      if (tags && tags.length > 0) {
        for (const tagName of tags) {
          if (!inMemoryTags.find(t => t.name === tagName)) {
            inMemoryTags.push({
              id: tagIdCounter++,
              name: tagName,
              color: '#3B82F6',
              created_at: now
            })
          }
        }
      }
      
      inMemoryCards.push(newCard)
      
      return c.json({ 
        id: cardId, 
        message: 'Business card created successfully (in-memory)' 
      })
    }

    // Insert business card
    const result = await DB.prepare(`
      INSERT INTO business_cards (
        name, company, department, position, phone, email, 
        address, website, registered_by, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      name, company, department, position, phone, email, 
      address, website, registered_by, notes
    ).run()

    const cardId = result.meta.last_row_id

    // Insert tags if provided
    if (tags.length > 0) {
      for (const tagName of tags) {
        // Get or create tag
        const tagResult = await DB.prepare(`
          INSERT OR IGNORE INTO tags (name) VALUES (?)
        `).bind(tagName).run()

        const { results: tagResults } = await DB.prepare(`
          SELECT id FROM tags WHERE name = ?
        `).bind(tagName).all()

        if (tagResults.length > 0) {
          await DB.prepare(`
            INSERT OR IGNORE INTO business_card_tags (business_card_id, tag_id) 
            VALUES (?, ?)
          `).bind(cardId, tagResults[0].id).run()
        }
      }
    }

    return c.json({ id: cardId, message: 'Business card created successfully' }, 201)
  } catch (error) {
    console.error('Error creating card:', error)
    return c.json({ error: 'Failed to create business card' }, 500)
  }
})

app.put('/api/cards/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')

  try {
    const cardData = await c.req.json()
    const { 
      name, company, department, position, phone, email, 
      address, website, notes, tags = [] 
    } = cardData

    if (!name || !company) {
      return c.json({ error: 'Name and company are required' }, 400)
    }

    if (!DB) {
      // Handle in-memory storage
      const cardIndex = inMemoryCards.findIndex(card => card.id == id)
      
      if (cardIndex === -1) {
        return c.json({ error: 'Business card not found' }, 404)
      }

      const now = new Date().toISOString()
      
      // Update card in memory
      inMemoryCards[cardIndex] = {
        ...inMemoryCards[cardIndex],
        name, company, department, position, phone, email,
        address, website, notes,
        tags: tags || [],
        tag_colors: tags.map(() => '#3B82F6'),
        updated_at: now
      }
      
      // Add new tags to in-memory tags if they don't exist
      if (tags && tags.length > 0) {
        for (const tagName of tags) {
          if (!inMemoryTags.find(t => t.name === tagName)) {
            inMemoryTags.push({
              id: tagIdCounter++,
              name: tagName,
              color: '#3B82F6',
              created_at: now
            })
          }
        }
      }

      return c.json({ message: 'Business card updated successfully (in-memory)' })
    }

    // Update business card in database
    await DB.prepare(`
      UPDATE business_cards SET 
        name = ?, company = ?, department = ?, position = ?, 
        phone = ?, email = ?, address = ?, website = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      name, company, department, position, phone, email, 
      address, website, notes, id
    ).run()

    // Update tags
    await DB.prepare(`DELETE FROM business_card_tags WHERE business_card_id = ?`).bind(id).run()

    if (tags.length > 0) {
      for (const tagName of tags) {
        await DB.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`).bind(tagName).run()

        const { results: tagResults } = await DB.prepare(`
          SELECT id FROM tags WHERE name = ?
        `).bind(tagName).all()

        if (tagResults.length > 0) {
          await DB.prepare(`
            INSERT INTO business_card_tags (business_card_id, tag_id) VALUES (?, ?)
          `).bind(id, tagResults[0].id).run()
        }
      }
    }

    return c.json({ message: 'Business card updated successfully' })
  } catch (error) {
    console.error('Error updating card:', error)
    return c.json({ error: 'Failed to update business card' }, 500)
  }
})

app.delete('/api/cards/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')

  try {
    if (!DB) {
      // Handle in-memory storage
      const cardIndex = inMemoryCards.findIndex(card => card.id == id)
      
      if (cardIndex === -1) {
        return c.json({ error: 'Business card not found' }, 404)
      }

      // Delete associated image from memory if exists
      const card = inMemoryCards[cardIndex]
      if (card.image_url) {
        const filename = card.image_url.split('/').pop()
        if (filename && inMemoryImages[filename]) {
          delete inMemoryImages[filename]
        }
      }

      // Remove card from memory
      inMemoryCards.splice(cardIndex, 1)

      return c.json({ message: 'Business card deleted successfully (in-memory)' })
    }

    const result = await DB.prepare(`DELETE FROM business_cards WHERE id = ?`).bind(id).run()

    if (result.changes === 0) {
      return c.json({ error: 'Business card not found' }, 404)
    }

    return c.json({ message: 'Business card deleted successfully' })
  } catch (error) {
    console.error('Error deleting card:', error)
    return c.json({ error: 'Failed to delete business card' }, 500)
  }
})

// Tags API
app.get('/api/tags', async (c) => {
  const { DB } = c.env

  if (!DB) {
    // Handle in-memory storage
    const tagCounts = inMemoryTags.map(tag => {
      const count = inMemoryCards.filter(card => 
        card.tags && card.tags.includes(tag.name)
      ).length
      
      return {
        ...tag,
        count
      }
    })
    
    // Sort by count DESC, name ASC
    tagCounts.sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count
      }
      return a.name.localeCompare(b.name)
    })

    return c.json({ tags: tagCounts })
  }

  try {
    const { results } = await DB.prepare(`
      SELECT t.*, COUNT(bct.business_card_id) as count 
      FROM tags t 
      LEFT JOIN business_card_tags bct ON t.id = bct.tag_id 
      GROUP BY t.id 
      ORDER BY count DESC, t.name ASC
    `).all()

    return c.json({ tags: results })
  } catch (error) {
    console.error('Error fetching tags:', error)
    return c.json({ error: 'Failed to fetch tags' }, 500)
  }
})

// Image Upload API
app.post('/api/cards/:id/image', async (c) => {
  const { R2, DB } = c.env
  const id = c.req.param('id')

  try {
    const formData = await c.req.formData()
    const file = formData.get('image') as File
    
    if (!file) {
      return c.json({ error: 'No image file provided' }, 400)
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return c.json({ error: 'File must be an image' }, 400)
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      return c.json({ error: 'File size must be less than 5MB' }, 400)
    }

    // Generate unique filename
    const timestamp = Date.now()
    const extension = file.name.split('.').pop() || 'jpg'
    const fileName = `business-card-${id}-${timestamp}.${extension}`
    const imageUrl = `/api/images/${fileName}`

    if (!R2 || !DB) {
      // Use in-memory storage when R2/DB is not configured
      const arrayBuffer = await file.arrayBuffer()
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
      
      // Store image in memory
      inMemoryImages[fileName] = {
        data: base64Data,
        type: file.type
      }
      
      // Update card in memory
      const cardIndex = inMemoryCards.findIndex(card => card.id == id)
      if (cardIndex !== -1) {
        inMemoryCards[cardIndex].image_url = imageUrl
        inMemoryCards[cardIndex].updated_at = new Date().toISOString()
      }
      
      return c.json({ 
        message: 'Image uploaded successfully (in-memory)',
        image_url: imageUrl 
      })
    }
    
    // Upload to R2 and update database (when available)
    await R2.put(fileName, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
    })

    await DB.prepare(`
      UPDATE business_cards SET image_url = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(imageUrl, id).run()

    return c.json({ 
      message: 'Image uploaded successfully',
      image_url: imageUrl 
    })
  } catch (error) {
    console.error('Error uploading image:', error)
    return c.json({ error: 'Failed to upload image' }, 500)
  }
})

// Image Serving API
app.get('/api/images/:filename', async (c) => {
  const { R2 } = c.env
  const filename = c.req.param('filename')

  try {
    // Check in-memory storage first
    if (inMemoryImages[filename]) {
      const imageData = inMemoryImages[filename]
      const binaryString = atob(imageData.data)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      
      return new Response(bytes.buffer, {
        headers: {
          'Content-Type': imageData.type,
          'Cache-Control': 'public, max-age=31536000', // 1 year cache
        },
      })
    }

    if (!R2) {
      return c.json({ error: 'Image not found' }, 404)
    }

    const object = await R2.get(filename)
    
    if (!object) {
      return c.json({ error: 'Image not found' }, 404)
    }

    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000', // 1 year cache
      },
    })
  } catch (error) {
    console.error('Error serving image:', error)
    return c.json({ error: 'Failed to serve image' }, 500)
  }
})

// Delete Image API
app.delete('/api/cards/:id/image', async (c) => {
  const { DB, R2 } = c.env
  const id = c.req.param('id')

  try {
    if (!DB) {
      // Handle in-memory storage
      const cardIndex = inMemoryCards.findIndex(card => card.id == id)
      
      if (cardIndex === -1) {
        return c.json({ error: 'Business card not found' }, 404)
      }

      const imageUrl = inMemoryCards[cardIndex].image_url
      
      if (imageUrl) {
        // Extract filename from URL and delete from memory
        const filename = imageUrl.split('/').pop()
        if (filename && inMemoryImages[filename]) {
          delete inMemoryImages[filename]
        }
      }

      // Update card in memory
      inMemoryCards[cardIndex].image_url = null
      inMemoryCards[cardIndex].updated_at = new Date().toISOString()

      return c.json({ message: 'Image deleted successfully (in-memory)' })
    }

    // Get current image URL from database
    const { results } = await DB.prepare(`
      SELECT image_url FROM business_cards WHERE id = ?
    `).bind(id).all()

    if (results.length === 0) {
      return c.json({ error: 'Business card not found' }, 404)
    }

    const imageUrl = results[0].image_url
    
    if (imageUrl) {
      // Extract filename from URL
      const filename = imageUrl.split('/').pop()
      if (filename && R2) {
        // Delete from R2
        await R2.delete(filename)
      }
    }

    // Update database
    await DB.prepare(`
      UPDATE business_cards SET image_url = NULL, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(id).run()

    return c.json({ message: 'Image deleted successfully' })
  } catch (error) {
    console.error('Error deleting image:', error)
    return c.json({ error: 'Failed to delete image' }, 500)
  }
})

// Main page with JSX (with Authentication)
app.get('/', (c) => {
  return c.render(
    <div>
      {/* Login Screen */}
      <div id="login-screen" className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full space-y-8">
          <div>
            <div className="text-center">
              <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
                <i className="fas fa-address-card mr-3 text-blue-600"></i>
                社内名刺管理システム
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                アクセスにはパスワードが必要です
              </p>
            </div>
          </div>
          <form className="mt-8 space-y-6" id="login-form">
            <div>
              <label htmlFor="password" className="sr-only">
                パスワード
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="パスワードを入力してください"
              />
            </div>
            <div>
              <button
                type="submit"
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <i className="fas fa-sign-in-alt mr-2"></i>
                ログイン
              </button>
            </div>
            <div id="login-error" className="hidden">
              <p className="text-red-600 text-sm text-center">パスワードが間違っています</p>
            </div>
          </form>
        </div>
      </div>

      {/* Main Application (hidden by default) */}
      <div id="main-app" className="min-h-screen bg-gray-50" style="display: none;">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center mb-8">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-4">
                  <i className="fas fa-address-card mr-3 text-blue-600"></i>
                  社内名刺管理システム
                </h1>
                <p className="text-lg text-gray-600">
                  名刺の共有・管理を効率的に行うWebアプリケーション
                </p>
              </div>
              <button 
                id="logout-btn" 
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md transition duration-200"
              >
                <i className="fas fa-sign-out-alt mr-2"></i>ログアウト
              </button>
            </div>
          </div>

          <div id="app">

            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">名刺一覧</h2>
                  <button 
                    id="add-card-btn" 
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition duration-200"
                  >
                    <i className="fas fa-plus mr-2"></i>新規登録
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex gap-4">
                    <input 
                      type="text" 
                      id="search-input" 
                      placeholder="名前・会社名・タグで検索（例: たなか、テック、えいぎょう）" 
                      className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button 
                      id="search-btn" 
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition duration-200"
                    >
                      <i className="fas fa-search mr-2"></i>検索
                    </button>
                    <button 
                      id="clear-search-btn" 
                      className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-md transition duration-200"
                    >
                      <i className="fas fa-times mr-2"></i>クリア
                    </button>
                  </div>
                  <p className="text-sm text-gray-600">
                    <i className="fas fa-info-circle mr-1"></i>
                    名前・会社名・タグをひらがな・カタカナ・漢字で検索可能（例: 「たなか」で「田中」、「えいぎょう」で「営業」タグがヒット）
                  </p>
                </div>
              </div>

              <div id="cards-container" className="p-6">
                <div className="text-center py-12">
                  <i className="fas fa-spinner fa-spin text-4xl text-gray-400 mb-4"></i>
                  <p className="text-gray-500">読み込み中...</p>
                </div>
              </div>
            </div>
          </div>

          {/* Modal */}
          <div id="card-modal" className="fixed inset-0 bg-gray-600 bg-opacity-50 hidden z-50">
            <div className="flex items-center justify-center min-h-screen p-4">
              <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-screen overflow-y-auto">
                <div className="p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 id="modal-title" className="text-xl font-semibold">新規名刺登録</h3>
                    <button id="close-modal" className="text-gray-400 hover:text-gray-600">
                      <i className="fas fa-times"></i>
                    </button>
                  </div>

                  <form id="card-form">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">氏名 *</label>
                        <input type="text" id="name" required className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">会社名 *</label>
                        <input type="text" id="company" required className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">部署</label>
                        <input type="text" id="department" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">役職</label>
                        <input type="text" id="position" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">電話番号</label>
                        <input type="text" id="phone" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">メールアドレス</label>
                        <input type="email" id="email" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">住所</label>
                        <input type="text" id="address" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Webサイト</label>
                        <input type="url" id="website" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">メモ</label>
                        <textarea id="notes" rows="3" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"></textarea>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">タグ (カンマ区切り)</label>
                        <input type="text" id="tags" placeholder="営業,技術,重要" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">名刺画像</label>
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                          <input 
                            type="file" 
                            id="image-upload" 
                            accept="image/*" 
                            className="hidden"
                          />
                          <div id="image-upload-area" className="text-center">
                            <i className="fas fa-cloud-upload-alt text-4xl text-gray-400 mb-4"></i>
                            <p className="text-gray-600 mb-2">クリックまたはファイルをドロップして画像をアップロード</p>
                            <p className="text-sm text-gray-500">JPG, PNG, GIF (最大5MB)</p>
                          </div>
                          <div id="image-preview" className="hidden">
                            <img id="preview-image" className="max-w-full h-48 object-contain mx-auto rounded-lg" />
                            <div className="mt-4 flex justify-center space-x-3">
                              <button type="button" id="change-image" className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm">
                                変更
                              </button>
                              <button type="button" id="remove-image" className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm">
                                削除
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between mt-6">
                      <div id="delete-buttons" className="hidden space-x-3">
                        <button type="button" id="delete-image-btn" className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md transition duration-200">
                          <i className="fas fa-image mr-2"></i>画像削除
                        </button>
                        <button type="button" id="delete-card-btn" className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md transition duration-200">
                          <i className="fas fa-trash mr-2"></i>名刺削除
                        </button>
                      </div>
                      <div className="flex gap-3">
                        <button type="button" id="cancel-btn" className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md transition duration-200">
                          キャンセル
                        </button>
                        <button type="submit" id="save-btn" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition duration-200">
                          保存
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet" />
      <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
      <script src="/static/auth.js"></script>
      <script src="/static/app.js"></script>
    </div>
  )
})

export default app
