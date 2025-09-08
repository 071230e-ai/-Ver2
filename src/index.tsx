import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { renderer } from './renderer'

// Type definitions for Cloudflare bindings
type Bindings = {
  DB: D1Database;
  R2: R2Bucket;
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS for API routes
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// Use JSX renderer
app.use(renderer)

// Business Cards API Routes
app.get('/api/cards', async (c) => {
  const { DB } = c.env
  const { search, company, department, tag, limit = '50', offset = '0' } = c.req.query()

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
    const conditions = []
    const params = []

    if (search) {
      conditions.push(`bc.id IN (
        SELECT rowid FROM business_cards_fts 
        WHERE business_cards_fts MATCH ?
      )`)
      params.push(search)
    }

    if (company) {
      conditions.push(`bc.company LIKE ?`)
      params.push(`%${company}%`)
    }

    if (department) {
      conditions.push(`bc.department LIKE ?`)
      params.push(`%${department}%`)
    }

    if (tag) {
      conditions.push(`bc.id IN (
        SELECT bct.business_card_id 
        FROM business_card_tags bct
        JOIN tags t ON bct.tag_id = t.id
        WHERE t.name = ?
      )`)
      params.push(tag)
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ')
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

    // Update business card
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
  const { R2 } = c.env
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
    const extension = file.name.split('.').pop()
    const fileName = `business-card-${id}-${timestamp}.${extension}`
    
    // Upload to R2
    await R2.put(fileName, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
    })

    // Update database with image URL
    const imageUrl = `/api/images/${fileName}`
    await c.env.DB.prepare(`
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
    // Get current image URL
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
      if (filename) {
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

// Main page with JSX
app.get('/', (c) => {
  return c.render(
    <div>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              <i className="fas fa-address-card mr-3 text-blue-600"></i>
              社内名刺管理システム
            </h1>
            <p className="text-lg text-gray-600">
              名刺の共有・管理を効率的に行うWebアプリケーション
            </p>
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

                <div className="flex flex-col md:flex-row gap-4">
                  <input 
                    type="text" 
                    id="search-input" 
                    placeholder="名前・会社名で検索..." 
                    className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <select 
                    id="company-filter" 
                    className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">全ての会社</option>
                  </select>
                  <button 
                    id="search-btn" 
                    className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition duration-200"
                  >
                    <i className="fas fa-search mr-2"></i>検索
                  </button>
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

                    <div className="flex justify-end gap-3 mt-6">
                      <button type="button" id="cancel-btn" className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md transition duration-200">
                        キャンセル
                      </button>
                      <button type="submit" id="save-btn" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition duration-200">
                        保存
                      </button>
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
      <script src="/static/app.js"></script>
    </div>
  )
})

export default app
