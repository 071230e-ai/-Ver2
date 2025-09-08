-- Sample data for Business Cards Management System

-- Insert sample tags
INSERT OR IGNORE INTO tags (name, color) VALUES 
  ('営業', '#EF4444'),
  ('技術', '#3B82F6'),
  ('管理職', '#8B5CF6'),
  ('パートナー', '#10B981'),
  ('顧客', '#F59E0B'),
  ('重要', '#EC4899');

-- Insert sample business cards
INSERT OR IGNORE INTO business_cards (name, company, department, position, phone, email, address, website, registered_by, notes) VALUES 
  (
    '田中 太郎', 
    '株式会社テックソリューション', 
    '営業部', 
    '営業部長', 
    '03-1234-5678', 
    'tanaka@techsolution.co.jp', 
    '東京都渋谷区渋谷1-1-1', 
    'https://techsolution.co.jp',
    'admin',
    '新規開拓担当、AI関連に詳しい'
  ),
  (
    '佐藤 花子', 
    '合同会社イノベート', 
    'エンジニアリング部', 
    'CTO', 
    '03-9876-5432', 
    'sato@innovate.co.jp', 
    '東京都新宿区新宿2-2-2', 
    'https://innovate.co.jp',
    'admin',
    'フルスタックエンジニア、React専門'
  ),
  (
    '山田 次郎', 
    '有限会社デザインワークス', 
    'デザイン部', 
    'デザイナー', 
    '03-5555-1111', 
    'yamada@designworks.co.jp', 
    '東京都港区青山3-3-3', 
    'https://designworks.co.jp',
    'admin',
    'UI/UXデザイン、ブランディング'
  ),
  (
    '鈴木 美咲', 
    '株式会社マーケティングプロ', 
    'マーケティング部', 
    'マネージャー', 
    '03-7777-8888', 
    'suzuki@marketing-pro.co.jp', 
    '東京都品川区大崎4-4-4', 
    'https://marketing-pro.co.jp',
    'admin',
    'デジタルマーケティング専門'
  ),
  (
    '高橋 健一', 
    '個人事業主', 
    '', 
    'フリーランス', 
    '090-1234-5678', 
    'takahashi@freelance.com', 
    '東京都世田谷区世田谷5-5-5', 
    'https://takahashi-portfolio.com',
    'admin',
    'Webコンサルタント、SEO対策'
  );

-- Link sample business cards with tags
INSERT OR IGNORE INTO business_card_tags (business_card_id, tag_id) VALUES 
  (1, 1), -- 田中 太郎 -> 営業
  (1, 5), -- 田中 太郎 -> 顧客
  (2, 2), -- 佐藤 花子 -> 技術
  (2, 3), -- 佐藤 花子 -> 管理職
  (3, 4), -- 山田 次郎 -> パートナー
  (4, 1), -- 鈴木 美咲 -> 営業
  (4, 3), -- 鈴木 美咲 -> 管理職
  (5, 4), -- 高橋 健一 -> パートナー
  (5, 6); -- 高橋 健一 -> 重要