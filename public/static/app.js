class BusinessCardManager {
  constructor() {
    this.currentCard = null;
    this.isEditing = false;
    this.selectedImage = null;
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.loadCards();
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

    // Close modal on backdrop click
    document.getElementById('card-modal').addEventListener('click', (e) => {
      if (e.target.id === 'card-modal') this.closeModal();
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
      const cards = response.data.cards;
      
      this.renderCards(cards);
    } catch (error) {
      console.error('Error loading cards:', error);
      this.showError('名刺一覧の読み込みに失敗しました');
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
      <div class="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition duration-200">
        ${card.image_url ? `
          <div class="mb-4">
            <img src="${this.escapeHtml(card.image_url)}" alt="名刺画像" class="w-full h-48 object-contain rounded-lg border border-gray-200">
          </div>
        ` : ''}
        
        <div class="flex justify-between items-start mb-4">
          <div class="flex-1">
            <h3 class="text-lg font-semibold text-gray-900">${this.escapeHtml(card.name)}</h3>
            <p class="text-sm text-gray-600">${this.escapeHtml(card.company)}</p>
            ${card.department ? `<p class="text-sm text-gray-500">${this.escapeHtml(card.department)}</p>` : ''}
            ${card.position ? `<p class="text-sm text-gray-500">${this.escapeHtml(card.position)}</p>` : ''}
          </div>
          <div class="flex gap-2">
            <button 
              onclick="cardManager.editCard(${card.id})" 
              class="text-blue-600 hover:text-blue-800 transition duration-200"
              title="編集"
            >
              <i class="fas fa-edit"></i>
            </button>
            ${card.image_url ? `
              <button 
                onclick="cardManager.deleteImage(${card.id})" 
                class="text-orange-600 hover:text-orange-800 transition duration-200"
                title="画像削除"
              >
                <i class="fas fa-image"></i>
              </button>
            ` : ''}
            <button 
              onclick="cardManager.deleteCard(${card.id})" 
              class="text-red-600 hover:text-red-800 transition duration-200"
              title="削除"
            >
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>

        <div class="space-y-2 text-sm">
          ${card.phone ? `
            <div class="flex items-center text-gray-700">
              <i class="fas fa-phone w-4 mr-2"></i>
              <a href="tel:${this.escapeHtml(card.phone)}" class="hover:text-blue-600">${this.escapeHtml(card.phone)}</a>
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

        <div class="mt-4 text-xs text-gray-400 border-t pt-3 flex justify-between">
          <span>登録者: ${this.escapeHtml(card.registered_by)}</span>
          <span>登録日: ${new Date(card.created_at).toLocaleDateString('ja-JP')}</span>
        </div>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        ${cardsHTML}
      </div>
    `;
  }

  openModal(card = null) {
    this.currentCard = card;
    this.isEditing = !!card;
    this.selectedImage = null;
    
    const modal = document.getElementById('card-modal');
    const title = document.getElementById('modal-title');
    const form = document.getElementById('card-form');
    
    // Reset image upload area
    this.removeImagePreview();
    
    if (this.isEditing) {
      title.textContent = '名刺編集';
      this.populateForm(card);
      
      // Show existing image if available
      if (card.image_url) {
        document.getElementById('preview-image').src = card.image_url;
        document.getElementById('image-upload-area').classList.add('hidden');
        document.getElementById('image-preview').classList.remove('hidden');
      }
    } else {
      title.textContent = '新規名刺登録';
      form.reset();
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

  async deleteImage(cardId) {
    if (!confirm('この名刺の画像を削除しますか？')) return;
    
    try {
      await axios.delete(`/api/cards/${cardId}/image`);
      this.showSuccess('画像を削除しました');
      await this.loadCards();
    } catch (error) {
      console.error('Error deleting image:', error);
      this.showError('画像の削除に失敗しました');
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

  async deleteCard(id) {
    if (!confirm('この名刺を削除しますか？')) return;
    
    try {
      await axios.delete(`/api/cards/${id}`);
      this.showSuccess('名刺を削除しました');
      await this.loadCards();
    } catch (error) {
      console.error('Error deleting card:', error);
      this.showError('名刺の削除に失敗しました');
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