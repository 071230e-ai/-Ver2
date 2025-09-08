class BusinessCardManager {
  constructor() {
    this.currentCard = null;
    this.isEditing = false;
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.loadStats();
    await this.loadCards();
    await this.loadCompanies();
  }

  setupEventListeners() {
    // Modal controls
    document.getElementById('add-card-btn').addEventListener('click', () => this.openModal());
    document.getElementById('close-modal').addEventListener('click', () => this.closeModal());
    document.getElementById('cancel-btn').addEventListener('click', () => this.closeModal());
    document.getElementById('card-form').addEventListener('submit', (e) => this.handleSubmit(e));

    // Search and filter
    document.getElementById('search-btn').addEventListener('click', () => this.handleSearch());
    document.getElementById('search-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleSearch();
    });
    document.getElementById('company-filter').addEventListener('change', () => this.handleSearch());

    // Close modal on backdrop click
    document.getElementById('card-modal').addEventListener('click', (e) => {
      if (e.target.id === 'card-modal') this.closeModal();
    });
  }

  async loadStats() {
    try {
      const response = await axios.get('/api/stats');
      const stats = response.data;
      
      document.getElementById('total-cards').textContent = stats.total_cards;
      document.getElementById('total-companies').textContent = stats.total_companies;
      document.getElementById('recent-cards').textContent = stats.recent_cards;
    } catch (error) {
      console.error('Error loading stats:', error);
      this.showError('統計情報の読み込みに失敗しました');
    }
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

  async loadCompanies() {
    try {
      const response = await axios.get('/api/cards');
      const cards = response.data.cards;
      
      const companies = [...new Set(cards.map(card => card.company))].sort();
      const select = document.getElementById('company-filter');
      
      // Clear existing options except the first one
      select.innerHTML = '<option value="">全ての会社</option>';
      
      companies.forEach(company => {
        const option = document.createElement('option');
        option.value = company;
        option.textContent = company;
        select.appendChild(option);
      });
    } catch (error) {
      console.error('Error loading companies:', error);
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
    
    const modal = document.getElementById('card-modal');
    const title = document.getElementById('modal-title');
    const form = document.getElementById('card-form');
    
    if (this.isEditing) {
      title.textContent = '名刺編集';
      this.populateForm(card);
    } else {
      title.textContent = '新規名刺登録';
      form.reset();
    }
    
    modal.classList.remove('hidden');
  }

  closeModal() {
    document.getElementById('card-modal').classList.add('hidden');
    document.getElementById('card-form').reset();
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
    
    const formData = new FormData(e.target);
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
      if (this.isEditing) {
        await axios.put(`/api/cards/${this.currentCard.id}`, cardData);
        this.showSuccess('名刺を更新しました');
      } else {
        await axios.post('/api/cards', cardData);
        this.showSuccess('名刺を登録しました');
      }
      
      this.closeModal();
      await this.loadCards();
      await this.loadStats();
      await this.loadCompanies();
    } catch (error) {
      console.error('Error saving card:', error);
      this.showError(this.isEditing ? '名刺の更新に失敗しました' : '名刺の登録に失敗しました');
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
      await this.loadStats();
      await this.loadCompanies();
    } catch (error) {
      console.error('Error deleting card:', error);
      this.showError('名刺の削除に失敗しました');
    }
  }

  handleSearch() {
    const search = document.getElementById('search-input').value.trim();
    const company = document.getElementById('company-filter').value;
    
    const filters = {};
    if (search) filters.search = search;
    if (company) filters.company = company;
    
    this.loadCards(filters);
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