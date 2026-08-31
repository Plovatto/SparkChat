export interface ChatBackground {
  id: string;
  name: string;
  background: string | null;
  isImage?: boolean;
}

export const CHAT_BACKGROUNDS: ChatBackground[] = [
  { id: 'default', name: 'Padrão', background: null },
  { id: 'gradient1', name: 'Oceano', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { id: 'gradient2', name: 'Pôr do Sol', background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { id: 'gradient3', name: 'Floresta', background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  { id: 'gradient4', name: 'Aurora', background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
  { id: 'gradient5', name: 'Crepúsculo', background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
  { id: 'gradient6', name: 'Noite Estrelada', background: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)' },
  { id: 'gradient7', name: 'Fogo', background: 'linear-gradient(135deg, #d30b0bff 0%, #ff4704ff 50%, #ff9900ff 100%)' },
  { id: 'gradient8', name: 'Agua Tropical', background: 'linear-gradient(135deg, #00d2fc 0%, #0051ffff 100%)' },
  { id: 'gradient9', name: 'Roxo Profundo', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)' },
  { id: 'gradient10', name: 'Verde Menta', background: 'linear-gradient(135deg, #9bebe7ff 0%, #a6f9e1ff 100%)' },
  {
    id: 'unsplash1',
    name: 'Montanhas',
    background: 'url(https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash2',
    name: 'Praia',
    background: 'url(https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash3',
    name: 'Cidade',
    background: 'url(https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash4',
    name: 'Natureza',
    background: 'url(https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash5',
    name: 'Espaço',
    background: 'url(https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash6',
    name: 'Flores',
    background: 'url(https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash7',
    name: 'Paisagem',
    background: 'url(https://plus.unsplash.com/premium_photo-1764436070248-d921cb42512c?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash8',
    name: 'Floresta Tropical',
    background: 'url(https://images.unsplash.com/photo-1511497584788-876760111969?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash9',
    name: 'Planta',
    background: 'url(https://images.unsplash.com/photo-1771097597430-f37105b6d224?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash10',
    name: 'Céu',
    background: 'url(https://images.unsplash.com/photo-1770110000218-e9376e581258?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash11',
    name: 'Deserto Dourado',
    background: 'url(https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash12',
    name: 'Lua',
    background: 'url(https://plus.unsplash.com/premium_photo-1767615278643-3bc025bf74cb?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash13',
    name: 'Folhagem',
    background:
      'url(https://images.unsplash.com/photo-1767321320442-b7afa2d10d44?q=80&w=1074&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)',
    isImage: true,
  },
  {
    id: 'unsplash14',
    name: 'Céu noturno',
    background:
      'url(https://plus.unsplash.com/premium_photo-1669072415061-0840b79b4d53?q=80&w=686&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)',
    isImage: true,
  },
  {
    id: 'unsplash15',
    name: 'Vegetação',
    background:
      'url(https://images.unsplash.com/photo-1767552659473-9a541393de94?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)',
    isImage: true,
  },
  {
    id: 'unsplash16',
    name: 'Árvores',
    background:
      'url(https://images.unsplash.com/photo-1767597186218-813e8e6c44d6?q=80&w=735&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)',
    isImage: true,
  },
  {
    id: 'unsplash17',
    name: 'Horizonte',
    background:
      'url(https://images.unsplash.com/photo-1586652592109-d070e78977c0?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)',
    isImage: true,
  },
  {
    id: 'unsplash18',
    name: 'Pássaros',
    background:
      'url(https://images.unsplash.com/photo-1767200488748-90e7f55428f1?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)',
    isImage: true,
  },
  {
    id: 'unsplash19',
    name: 'Cores',
    background:
      'url(https://plus.unsplash.com/premium_photo-1670876807656-28aa4685ea0d?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)',
    isImage: true,
  },
  {
    id: 'unsplash20',
    name: 'Pato',
    background:
      'url(https://images.unsplash.com/photo-1766512433799-3dbbb38130d3?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)',
    isImage: true,
  },
];
