class BusinessCardManager {
  constructor() {
    this.currentCard = null;
    this.isEditing = false;
    this.selectedImage = null;
    this.init();
  }

  async init() {
    // Wait for authentication before initializing
    this.waitForAuth();
  }

  waitForAuth() {
    // Check if user is authenticated every 100ms
    const authCheck = setInterval(() => {
      if (window.authManager && document.getElementById('main-app').style.display !== 'none') {
        clearInterval(authCheck);
        this.setupEventListeners();
        this.loadCards();
      }
    }, 100);
  }

  setupEventListeners() {
    // Modal controls
    document.getElementById('add-card-btn').addEventListener('click', () => this.openModal());
    document.getElementById('close-modal').addEventListener('click', () => this.closeModal());
    document.getElementById('cancel-btn').addEventListener('click', () => this.closeModal());
    document.getElementById('card-form').addEventListener('submit', (e) => this.handleSubmit(e));

    // Search controls
    document.getElementById('search-btn').addEventListener('click', () => this.handleSearch());
    document.getElementById('clear-search-btn').addEventListener('click', () => this.clearSearch());
    document.getElementById('search-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleSearch();
    });

    // Image upload controls
    document.getElementById('image-upload-area').addEventListener('click', () => {
      document.getElementById('image-upload').click();
    });
    
    document.getElementById('image-upload').addEventListener('change', (e) => {
      this.handleImageSelect(e.target.files[0]);
    });

    document.getElementById('change-image').addEventListener('click', () => {
      document.getElementById('image-upload').click();
    });

    document.getElementById('remove-image').addEventListener('click', () => {
      this.removeImagePreview();
    });

    // Delete buttons in modal
    document.getElementById('delete-image-btn').addEventListener('click', () => {
      this.deleteImageFromModal();
    });

    document.getElementById('delete-card-btn').addEventListener('click', () => {
      this.deleteCardFromModal();
    });

    // Drag and drop
    const uploadArea = document.getElementById('image-upload-area');
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('bg-gray-100');
    });

    uploadArea.addEventListener('dragleave', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('bg-gray-100');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('bg-gray-100');
      
      const files = e.dataTransfer.files;
      if (files.length > 0 && files[0].type.startsWith('image/')) {
        this.handleImageSelect(files[0]);
      }
    });

    // Close modal when clicking outside
    document.getElementById('card-modal').addEventListener('click', (e) => {
      if (e.target.id === 'card-modal') this.closeModal();
    });

    // Close enlarged image with Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeImageViewer();
    });
  }

  handleImageSelect(file) {
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      this.showError('画像ファイルを選択してください');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      this.showError('ファイルサイズは5MB以下にしてください');
      return;
    }

    this.selectedImage = file;
    this.showImagePreview(file);
  }

  showImagePreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById('preview-image').src = e.target.result;
      document.getElementById('image-upload-area').classList.add('hidden');
      document.getElementById('image-preview').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }

  removeImagePreview() {
    this.selectedImage = null;
    document.getElementById('image-upload-area').classList.remove('hidden');
    document.getElementById('image-preview').classList.add('hidden');
    document.getElementById('image-upload').value = '';
  }

  async loadCards(filters = {}) {
    try {
      const params = new URLSearchParams(filters);
      const response = await axios.get(`/api/cards?${params}`);
      const data = response.data;
      const cards = data.cards;
      
      // Update count display
      this.updateCardCount(data.totalCount, data.filteredCount, filters.search);
      
      this.renderCards(cards);
    } catch (error) {
      console.error('Error loading cards:', error);
      this.showError('名刺一覧の読み込みに失敗しました');
    }
  }

  updateCardCount(totalCount, filteredCount, searchTerm) {
    const countElement = document.getElementById('count-text');
    if (!countElement) return;

    // Check if any filters are applied (currently only search, but extensible)
    const hasFilters = searchTerm && searchTerm.trim() !== '';

    if (hasFilters) {
      // During search/filtering: show "Display Count: X / Total Count: Y"
      countElement.textContent = `表示件数：${filteredCount}件／登録件数：${totalCount}件`;
    } else {
      // Normal view: show "Total Count: X"
      countElement.textContent = `登録件数：${totalCount}件`;
    }
  }

  renderCards(cards) {
    const container = document.getElementById('cards-container');
    
    if (cards.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12">
          <i class="fas fa-address-card text-4xl text-gray-400 mb-4"></i>
          <p class="text-gray-500">名刺が見つかりませんでした</p>
        </div>
      `;
      return;
    }

    const cardsHTML = cards.map(card => `
      <article class="business-card-item bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm hover:shadow-md transition duration-200 overflow-hidden">
        ${card.image_url ? `
          <button type="button" class="business-card-image-frame mb-4" aria-label="${this.escapeHtml(card.name)}さんの名刺画像を拡大表示">
            <img
              src="${this.escapeHtml(card.image_url)}"
              data-original-src="${this.escapeHtml(card.image_url)}"
              alt="${this.escapeHtml(card.name)}さんの名刺画像"
              class="business-card-image"
              loading="lazy"
            >
          </button>
        ` : ''}
        
        <div class="flex justify-between items-start mb-4">
          <div class="flex-1">
            <h3 class="text-lg font-bold text-gray-900 leading-snug">${this.escapeHtml(card.name)}</h3>
            <p class="text-base text-gray-700 mt-1">${this.escapeHtml(card.company)}</p>
            ${card.department ? `<p class="text-sm text-gray-600 mt-1">${this.escapeHtml(card.department)}</p>` : ''}
            ${card.position ? `<p class="text-sm text-gray-600">${this.escapeHtml(card.position)}</p>` : ''}
          </div>
          <div class="flex gap-2">
            <button 
              onclick="cardManager.editCard(${card.id})" 
              class="w-11 h-11 -mt-2 -mr-2 flex items-center justify-center text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-full transition duration-200"
              aria-label="${this.escapeHtml(card.name)}さんの名刺を編集"
              title="編集"
            >
              <i class="fas fa-edit"></i>
            </button>
          </div>
        </div>

        <div class="space-y-3 text-sm sm:text-base">
          ${card.phone ? `
            <div class="flex items-start text-gray-700">
              <i class="fas fa-phone w-5 mr-2 mt-1"></i>
              <a href="tel:${this.escapeHtml(card.phone)}" class="text-blue-700 hover:text-blue-800 break-all py-0.5">${this.escapeHtml(card.phone)}</a>
            </div>
          ` : ''}
          
          ${card.email ? `
            <div class="flex items-center text-gray-700">
              <i class="fas fa-envelope w-4 mr-2"></i>
              <a href="mailto:${this.escapeHtml(card.email)}" class="hover:text-blue-600">${this.escapeHtml(card.email)}</a>
            </div>
          ` : ''}
          
          ${card.website ? `
            <div class="flex items-center text-gray-700">
              <i class="fas fa-globe w-4 mr-2"></i>
              <a href="${this.escapeHtml(card.website)}" target="_blank" class="hover:text-blue-600">${this.escapeHtml(card.website)}</a>
            </div>
          ` : ''}
          
          ${card.address ? `
            <div class="flex items-center text-gray-700">
              <i class="fas fa-map-marker-alt w-4 mr-2"></i>
              <span>${this.escapeHtml(card.address)}</span>
            </div>
          ` : ''}
        </div>

        ${card.tags && card.tags.length > 0 ? `
          <div class="mt-4">
            <div class="flex flex-wrap gap-2">
              ${card.tags.map((tag, index) => `
                <span class="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                  ${this.escapeHtml(tag)}
                </span>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${card.notes ? `
          <div class="mt-4 text-sm text-gray-600 border-t pt-3">
            <p>${this.escapeHtml(card.notes)}</p>
          </div>
        ` : ''}

        <div class="mt-4 text-xs text-gray-500 border-t pt-3 flex flex-col sm:flex-row gap-1 sm:justify-between">
          <span>登録者: ${this.escapeHtml(card.registered_by)}</span>
          <span>登録日: ${new Date(card.created_at).toLocaleDateString('ja-JP')}</span>
        </div>
      </article>
    `).join('');

    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-6">
        ${cardsHTML}
      </div>
    `;

    this.enhanceCardImages(container);
  }

  enhanceCardImages(container) {
    const frames = container.querySelectorAll('.business-card-image-frame');

    frames.forEach((frame) => {
      const img = frame.querySelector('.business-card-image');
      if (!img) return;

      frame.addEventListener('click', () => {
        this.openImageViewer(img.src, img.alt);
      });

      const cropWhenReady = () => {
        this.cropBusinessCardWhitespace(img).catch(() => {
          // Keep the original image if automatic cropping fails.
        });
      };

      if (img.complete && img.naturalWidth > 0) {
        cropWhenReady();
      } else {
        img.addEventListener('load', cropWhenReady, { once: true });
      }
    });
  }

  async cropBusinessCardWhitespace(img) {
    const originalSrc = img.dataset.originalSrc || img.src;
    const source = new Image();
    source.decoding = 'async';
    source.src = originalSrc;

    if (!source.complete) {
      await new Promise((resolve, reject) => {
        source.onload = resolve;
        source.onerror = reject;
      });
    }

    const width = source.naturalWidth;
    const height = source.naturalHeight;
    if (!width || !height || width < 80 || height < 50) return;

    const maxAnalysisWidth = 1000;
    const scale = Math.min(1, maxAnalysisWidth / width);
    const analysisWidth = Math.max(1, Math.round(width * scale));
    const analysisHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = analysisWidth;
    canvas.height = analysisHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.drawImage(source, 0, 0, analysisWidth, analysisHeight);

    let pixels;
    try {
      pixels = ctx.getImageData(0, 0, analysisWidth, analysisHeight).data;
    } catch (error) {
      return;
    }

    const mask = new Uint8Array(analysisWidth * analysisHeight);
    const initialColCounts = new Uint32Array(analysisWidth);

    for (let y = 0; y < analysisHeight; y += 1) {
      for (let x = 0; x < analysisWidth; x += 1) {
        const i = (y * analysisWidth + x) * 4;
        if (pixels[i + 3] < 20) continue;

        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const minChannel = Math.min(r, g, b);
        const maxChannel = Math.max(r, g, b);
        const saturation = maxChannel - minChannel;

        // Focus on clearly printed text/logos/QR codes. Pale scanner shadows
        // and near-white paper are intentionally ignored.
        const isContent = minChannel < 218 || (saturation > 42 && minChannel < 242);
        if (isContent) {
          mask[y * analysisWidth + x] = 1;
          initialColCounts[x] += 1;
        }
      }
    }

    // Scanner photos often contain a long black line at the extreme edge.
    // Treat near-full-height dark columns near either edge as artifacts.
    const artifactColumn = new Uint8Array(analysisWidth);
    const edgeZone = Math.max(6, Math.round(analysisWidth * 0.14));
    for (let x = 0; x < analysisWidth; x += 1) {
      const nearEdge = x < edgeZone || x >= analysisWidth - edgeZone;
      if (nearEdge && initialColCounts[x] > analysisHeight * 0.48) {
        artifactColumn[x] = 1;
      }
    }

    const rowCounts = new Uint32Array(analysisHeight);
    for (let y = 0; y < analysisHeight; y += 1) {
      let count = 0;
      for (let x = 0; x < analysisWidth; x += 1) {
        if (!artifactColumn[x] && mask[y * analysisWidth + x]) count += 1;
      }
      rowCounts[y] = count;
    }

    const weightedBounds = (counts, lowFraction, highFraction) => {
      let total = 0;
      for (let i = 0; i < counts.length; i += 1) total += counts[i];
      if (!total) return null;

      const lowTarget = total * lowFraction;
      const highTarget = total * highFraction;
      let cumulative = 0;
      let low = 0;
      let high = counts.length - 1;
      let lowFound = false;

      for (let i = 0; i < counts.length; i += 1) {
        cumulative += counts[i];
        if (!lowFound && cumulative >= lowTarget) {
          low = i;
          lowFound = true;
        }
        if (cumulative >= highTarget) {
          high = i;
          break;
        }
      }
      return { low, high, total };
    };

    // Weighted percentiles eliminate isolated dust in the large blank lower
    // half while retaining nearly all real printed content.
    const yBounds = weightedBounds(rowCounts, 0.006, 0.994);
    if (!yBounds) return;

    let top = yBounds.low;
    let bottom = yBounds.high;
    const contentHeight = bottom - top + 1;
    if (contentHeight < analysisHeight * 0.12) return;

    const colCounts = new Uint32Array(analysisWidth);
    for (let x = 0; x < analysisWidth; x += 1) {
      if (artifactColumn[x]) continue;
      let count = 0;
      for (let y = top; y <= bottom; y += 1) {
        if (mask[y * analysisWidth + x]) count += 1;
      }
      colCounts[x] = count;
    }

    const xBounds = weightedBounds(colCounts, 0.004, 0.996);
    if (!xBounds) return;

    let left = xBounds.low;
    let right = xBounds.high;

    let cropWidth = right - left + 1;
    let cropHeight = bottom - top + 1;
    if (cropWidth < analysisWidth * 0.16 || cropHeight < analysisHeight * 0.12) return;

    // A small safety margin keeps characters and logos from touching the edge,
    // but does not bring back the large scanner whitespace.
    const padX = Math.max(4, Math.round(cropWidth * 0.018));
    const padY = Math.max(4, Math.round(cropHeight * 0.028));
    left = Math.max(0, left - padX);
    right = Math.min(analysisWidth - 1, right + padX);
    top = Math.max(0, top - padY);
    bottom = Math.min(analysisHeight - 1, bottom + padY);

    cropWidth = right - left + 1;
    cropHeight = bottom - top + 1;

    const retainedArea = (cropWidth * cropHeight) / (analysisWidth * analysisHeight);
    if (retainedArea > 0.97) return;

    const sourceX = left / scale;
    const sourceY = top / scale;
    const sourceWidth = cropWidth / scale;
    const sourceHeight = cropHeight / scale;

    const output = document.createElement('canvas');
    output.width = Math.max(1, Math.round(sourceWidth));
    output.height = Math.max(1, Math.round(sourceHeight));
    const outputCtx = output.getContext('2d');
    if (!outputCtx) return;

    outputCtx.fillStyle = '#ffffff';
    outputCtx.fillRect(0, 0, output.width, output.height);
    outputCtx.drawImage(
      source,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      output.width,
      output.height
    );

    try {
      img.src = output.toDataURL('image/jpeg', 0.94);
      img.dataset.autoCropped = 'true';
    } catch (error) {
      img.src = originalSrc;
    }
  }

  openImageViewer(src, alt = '名刺画像') {
    this.closeImageViewer();

    const viewer = document.createElement('div');
    viewer.id = 'business-card-image-viewer';
    viewer.className = 'business-card-image-viewer';
    viewer.innerHTML = `
      <div class="business-card-image-viewer__backdrop" data-close-viewer></div>
      <div class="business-card-image-viewer__dialog" role="dialog" aria-modal="true" aria-label="名刺画像の拡大表示">
        <img class="business-card-image-viewer__image" src="${this.escapeHtml(src)}" alt="${this.escapeHtml(alt)}">
        <button type="button" class="business-card-image-viewer__close" aria-label="拡大表示を閉じる" data-close-viewer>
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;

    viewer.querySelectorAll('[data-close-viewer]').forEach((element) => {
      element.addEventListener('click', () => this.closeImageViewer());
    });

    document.body.appendChild(viewer);
    document.body.style.overflow = 'hidden';
  }

  closeImageViewer() {
    const viewer = document.getElementById('business-card-image-viewer');
    if (!viewer) return;
    viewer.remove();
    document.body.style.overflow = 'auto';
  }

  openModal(card = null) {
    this.currentCard = card;
    this.isEditing = !!card;
    this.selectedImage = null;
    
    const modal = document.getElementById('card-modal');
    const title = document.getElementById('modal-title');
    const form = document.getElementById('card-form');
    const deleteButtons = document.getElementById('delete-buttons');
    const deleteImageBtn = document.getElementById('delete-image-btn');
    
    // Reset image upload area
    this.removeImagePreview();
    
    if (this.isEditing) {
      title.textContent = '名刺編集';
      this.populateForm(card);
      
      // Show delete buttons in edit mode
      deleteButtons.classList.remove('hidden');
      
      // Show/hide image delete button based on image availability
      if (card.image_url) {
        deleteImageBtn.classList.remove('hidden');
        document.getElementById('preview-image').src = card.image_url;
        document.getElementById('image-upload-area').classList.add('hidden');
        document.getElementById('image-preview').classList.remove('hidden');
      } else {
        deleteImageBtn.classList.add('hidden');
      }
    } else {
      title.textContent = '新規名刺登録';
      form.reset();
      
      // Hide delete buttons in create mode
      deleteButtons.classList.add('hidden');
    }
    
    modal.classList.remove('hidden');
  }

  closeModal() {
    document.getElementById('card-modal').classList.add('hidden');
    document.getElementById('card-form').reset();
    this.removeImagePreview();
    this.currentCard = null;
    this.isEditing = false;
  }

  populateForm(card) {
    document.getElementById('name').value = card.name || '';
    document.getElementById('company').value = card.company || '';
    document.getElementById('department').value = card.department || '';
    document.getElementById('position').value = card.position || '';
    document.getElementById('phone').value = card.phone || '';
    document.getElementById('email').value = card.email || '';
    document.getElementById('address').value = card.address || '';
    document.getElementById('website').value = card.website || '';
    document.getElementById('notes').value = card.notes || '';
    document.getElementById('tags').value = card.tags ? card.tags.join(', ') : '';
  }

  async handleSubmit(e) {
    e.preventDefault();
    
    const cardData = {
      name: document.getElementById('name').value,
      company: document.getElementById('company').value,
      department: document.getElementById('department').value,
      position: document.getElementById('position').value,
      phone: document.getElementById('phone').value,
      email: document.getElementById('email').value,
      address: document.getElementById('address').value,
      website: document.getElementById('website').value,
      notes: document.getElementById('notes').value,
      tags: document.getElementById('tags').value.split(',').map(t => t.trim()).filter(t => t)
    };

    try {
      let cardId;
      
      if (this.isEditing) {
        await axios.put(`/api/cards/${this.currentCard.id}`, cardData);
        cardId = this.currentCard.id;
        this.showSuccess('名刺を更新しました');
      } else {
        const response = await axios.post('/api/cards', cardData);
        cardId = response.data.id;
        this.showSuccess('名刺を登録しました');
      }
      
      // Upload image if selected
      if (this.selectedImage && cardId) {
        await this.uploadImage(cardId, this.selectedImage);
      }
      
      this.closeModal();
      await this.loadCards();
    } catch (error) {
      console.error('Error saving card:', error);
      this.showError(this.isEditing ? '名刺の更新に失敗しました' : '名刺の登録に失敗しました');
    }
  }

  async uploadImage(cardId, file) {
    try {
      const formData = new FormData();
      formData.append('image', file);
      
      await axios.post(`/api/cards/${cardId}/image`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      this.showSuccess('画像をアップロードしました');
    } catch (error) {
      console.error('Error uploading image:', error);
      this.showError('画像のアップロードに失敗しました');
    }
  }

  async deleteImageFromModal() {
    if (!this.currentCard || !confirm('この名刺の画像を削除しますか？')) return;
    
    try {
      await axios.delete(`/api/cards/${this.currentCard.id}/image`);
      this.showSuccess('画像を削除しました');
      
      // Update UI
      document.getElementById('delete-image-btn').classList.add('hidden');
      this.removeImagePreview();
      
      await this.loadCards();
    } catch (error) {
      console.error('Error deleting image:', error);
      this.showError('画像の削除に失敗しました');
    }
  }

  async deleteCardFromModal() {
    if (!this.currentCard || !confirm('この名刺を削除しますか？この操作は元に戻せません。')) return;
    
    try {
      await axios.delete(`/api/cards/${this.currentCard.id}`);
      this.showSuccess('名刺を削除しました');
      this.closeModal();
      await this.loadCards();
    } catch (error) {
      console.error('Error deleting card:', error);
      this.showError('名刺の削除に失敗しました');
    }
  }

  async editCard(id) {
    try {
      const response = await axios.get(`/api/cards/${id}`);
      const card = response.data.card;
      this.openModal(card);
    } catch (error) {
      console.error('Error loading card:', error);
      this.showError('名刺の読み込みに失敗しました');
    }
  }

  handleSearch() {
    const search = document.getElementById('search-input').value.trim();
    
    const filters = {};
    if (search) filters.search = search;
    
    this.loadCards(filters);
  }

  clearSearch() {
    document.getElementById('search-input').value = '';
    this.loadCards();
  }

  showSuccess(message) {
    this.showToast(message, 'success');
  }

  showError(message) {
    this.showToast(message, 'error');
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 z-50 p-4 rounded-md shadow-lg transition-all duration-300 ${
      type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500'
    } text-white`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize the application
const cardManager = new BusinessCardManager();