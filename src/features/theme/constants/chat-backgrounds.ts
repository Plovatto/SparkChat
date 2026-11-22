export interface ChatBackground {
  id: string;
  background: string | null;
  isImage?: boolean;
}

export const CHAT_BACKGROUNDS: ChatBackground[] = [
  { id: 'default', background: null },
  { id: 'gradient1', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { id: 'gradient2', background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { id: 'gradient3', background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  { id: 'gradient4', background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
  { id: 'gradient5', background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
  { id: 'gradient6', background: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)' },
  { id: 'gradient7', background: 'linear-gradient(135deg, #d30b0bff 0%, #ff4704ff 50%, #ff9900ff 100%)' },
  { id: 'gradient8', background: 'linear-gradient(135deg, #00d2fc 0%, #0051ffff 100%)' },
  { id: 'gradient9', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)' },
  { id: 'gradient10', background: 'linear-gradient(135deg, #9bebe7ff 0%, #a6f9e1ff 100%)' },
  { id: 'gradient11', background: 'linear-gradient(135deg, #56ccf2 0%, #2f80ed 100%)' },
  { id: 'gradient12', background: 'linear-gradient(135deg, #f857a6 0%, #ff5858 100%)' },
  { id: 'gradient13', background: 'linear-gradient(135deg, #9d50bb 0%, #6e48aa 100%)' },
  { id: 'gradient14', background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
  { id: 'gradient15', background: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)' },
  { id: 'gradient16', background: 'linear-gradient(135deg, #f2994a 0%, #f2c94c 100%)' },
  { id: 'gradient17', background: 'linear-gradient(135deg, #603813 0%, #b29f94 100%)' },
  { id: 'gradient18', background: 'linear-gradient(135deg, #ff0844 0%, #ffb199 100%)' },
  { id: 'gradient19', background: 'linear-gradient(135deg, #232526 0%, #414345 100%)' },
  { id: 'gradient20', background: 'linear-gradient(135deg, #74ebd5 0%, #acb6e5 100%)' },
  {
    id: 'unsplash1',
    background: 'url(https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash2',
    background: 'url(https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash3',
    background: 'url(https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash4',
    background: 'url(https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash5',
    background: 'url(https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash6',
    background: 'url(https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash7',
    background: 'url(https://plus.unsplash.com/premium_photo-1764436070248-d921cb42512c?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash8',
    background: 'url(https://images.unsplash.com/photo-1511497584788-876760111969?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash9',
    background: 'url(https://images.unsplash.com/photo-1771097597430-f37105b6d224?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash10',
    background: 'url(https://images.unsplash.com/photo-1770110000218-e9376e581258?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash11',
    background: 'url(https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash12',
    background: 'url(https://plus.unsplash.com/premium_photo-1767615278643-3bc025bf74cb?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash13',
    background:
      'url(https://images.unsplash.com/photo-1767321320442-b7afa2d10d44?q=80&w=1074&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)',
    isImage: true,
  },
  {
    id: 'unsplash14',
    background:
      'url(https://plus.unsplash.com/premium_photo-1669072415061-0840b79b4d53?q=80&w=686&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)',
    isImage: true,
  },
  {
    id: 'unsplash15',
    background:
      'url(https://images.unsplash.com/photo-1767552659473-9a541393de94?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)',
    isImage: true,
  },
  {
    id: 'unsplash16',
    background:
      'url(https://images.unsplash.com/photo-1767597186218-813e8e6c44d6?q=80&w=735&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)',
    isImage: true,
  },
  {
    id: 'unsplash17',
    background:
      'url(https://images.unsplash.com/photo-1586652592109-d070e78977c0?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)',
    isImage: true,
  },
  {
    id: 'unsplash18',
    background:
      'url(https://images.unsplash.com/photo-1767200488748-90e7f55428f1?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)',
    isImage: true,
  },
  {
    id: 'unsplash19',
    background:
      'url(https://plus.unsplash.com/premium_photo-1670876807656-28aa4685ea0d?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)',
    isImage: true,
  },
  {
    id: 'unsplash20',
    background:
      'url(https://images.unsplash.com/photo-1766512433799-3dbbb38130d3?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)',
    isImage: true,
  },
  {
    id: 'unsplash21',
    background: 'url(https://images.unsplash.com/photo-1746982313711-ab0d0f59b262?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash22',
    background: 'url(https://images.unsplash.com/photo-1760875467778-764e3f918b1c?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash23',
    background: 'url(https://images.unsplash.com/photo-1765871321198-30fffc41e605?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash24',
    background: 'url(https://images.unsplash.com/photo-1719264493104-62c8f920e6b8?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash25',
    background: 'url(https://images.unsplash.com/photo-1744768326067-8b9835957c86?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash26',
    background: 'url(https://images.unsplash.com/photo-1713970700051-556d05c59fce?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash27',
    background: 'url(https://images.unsplash.com/photo-1769626124735-80cb3bb31ecb?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash28',
    background: 'url(https://plus.unsplash.com/premium_photo-1753205978545-a3c66da7e99d?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash29',
    background: 'url(https://images.unsplash.com/photo-1742183635099-bf6d03fca5c7?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash30',
    background: 'url(https://images.unsplash.com/photo-1699575678956-aefa714b67f0?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash31',
    background: 'url(https://images.unsplash.com/photo-1738745056026-87efb5f6ebc8?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash32',
    background: 'url(https://images.unsplash.com/photo-1647292545204-1c537d2ffb71?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash33',
    background: 'url(https://images.unsplash.com/photo-1724590391555-e4d81815e0af?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash34',
    background: 'url(https://images.unsplash.com/photo-1767978918948-e8b8317a1a4a?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash35',
    background: 'url(https://images.unsplash.com/photo-1760868718218-ff73db4518fd?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash36',
    background: 'url(https://images.unsplash.com/photo-1677030960206-249628309d11?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash37',
    background: 'url(https://images.unsplash.com/photo-1546527868-ccb7ee7dfa6a?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash38',
    background: 'url(https://images.unsplash.com/photo-1742466851711-24e957c6f2a8?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash39',
    background: 'url(https://images.unsplash.com/photo-1754697831323-6d51e460ba8f?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash40',
    background: 'url(https://images.unsplash.com/photo-1643966442523-56ce53f9b46d?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash41',
    background: 'url(https://images.unsplash.com/photo-1708649290066-5f617003b93f?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash42',
    background: 'url(https://images.unsplash.com/photo-1759503408354-8cfa8a13115e?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash43',
    background: 'url(https://images.unsplash.com/photo-1633460205593-11131ea78e20?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash44',
    background: 'url(https://images.unsplash.com/photo-1601996130687-17651bf61b71?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash45',
    background: 'url(https://images.unsplash.com/photo-1664926193557-7144095af7ee?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash46',
    background: 'url(https://images.unsplash.com/photo-1757829316010-029a3476512a?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash47',
    background: 'url(https://images.unsplash.com/photo-1747985323857-5c1c16b2ac47?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash48',
    background: 'url(https://images.unsplash.com/photo-1663860307386-891a5beb6e9d?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash49',
    background: 'url(https://images.unsplash.com/photo-1770024598483-b8e109485d7d?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash50',
    background: 'url(https://images.unsplash.com/photo-1771095436222-e20a8737fcd1?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash51',
    background: 'url(https://images.unsplash.com/photo-1741948924635-13a7ddbc6a05?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash52',
    background: 'url(https://images.unsplash.com/photo-1698273578338-418ed804f58c?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash53',
    background: 'url(https://images.unsplash.com/photo-1553615978-22ad504800b7?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash54',
    background: 'url(https://images.unsplash.com/photo-1749784642255-3bc739489b0a?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash55',
    background: 'url(https://images.unsplash.com/photo-1765098139127-5fa14432dd8a?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash56',
    background: 'url(https://images.unsplash.com/photo-1755685068178-4b57210ddcd4?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash57',
    background: 'url(https://images.unsplash.com/photo-1708621834087-915cddd93aa1?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash58',
    background: 'url(https://images.unsplash.com/photo-1754171389475-179cc9a39aea?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash59',
    background: 'url(https://images.unsplash.com/photo-1786352260444-20539d92fee0?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash60',
    background: 'url(https://images.unsplash.com/photo-1763786470689-5ff88c985885?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash61',
    background: 'url(https://images.unsplash.com/photo-1758694137756-a95e5d59d7ce?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash62',
    background: 'url(https://images.unsplash.com/photo-1718875729305-c3dd1bde61f3?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash63',
    background: 'url(https://images.unsplash.com/photo-1757010230553-d801442437ae?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash64',
    background: 'url(https://images.unsplash.com/photo-1727200450646-6c189bd27466?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash65',
    background: 'url(https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash66',
    background: 'url(https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash67',
    background: 'url(https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash68',
    background: 'url(https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash69',
    background: 'url(https://images.unsplash.com/photo-1794998808561-03ec973d0732?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash70',
    background: 'url(https://images.unsplash.com/photo-1794942367964-36710f065129?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash71',
    background: 'url(https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash72',
    background: 'url(https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash73',
    background: 'url(https://images.unsplash.com/photo-1511300636408-a63a89df3482?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash74',
    background: 'url(https://images.unsplash.com/photo-1782383618703-5117c444883b?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash75',
    background: 'url(https://images.unsplash.com/photo-1795231969545-c429d53ef581?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash76',
    background: 'url(https://images.unsplash.com/photo-1509023464722-18d996393ca8?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash77',
    background: 'url(https://images.unsplash.com/photo-1499678329028-101435549a4e?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash78',
    background: 'url(https://images.unsplash.com/photo-1505832018823-50331d70d237?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash79',
    background: 'url(https://images.unsplash.com/photo-1532274402911-5a369e4c4bb5?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash80',
    background: 'url(https://images.unsplash.com/photo-1485470733090-0aae1788d5af?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash81',
    background: 'url(https://images.unsplash.com/photo-1471922694854-ff1b63b20054?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash82',
    background: 'url(https://images.unsplash.com/photo-1519046904884-53103b34b206?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash83',
    background: 'url(https://images.unsplash.com/photo-1484821582734-6c6c9f99a672?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash84',
    background: 'url(https://images.unsplash.com/photo-1475924156734-496f6cac6ec1?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash85',
    background: 'url(https://images.unsplash.com/photo-1791951853525-dff83832d5ae?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash86',
    background: 'url(https://images.unsplash.com/photo-1483729558449-99ef09a8c325?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash87',
    background: 'url(https://images.unsplash.com/photo-1643400813604-b3877e0c4db9?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash88',
    background: 'url(https://images.unsplash.com/photo-1503803548695-c2a7b4a5b875?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash89',
    background: 'url(https://images.unsplash.com/photo-1490735891913-40897cdaafd1?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash90',
    background: 'url(https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash91',
    background: 'url(https://images.unsplash.com/photo-1779380033776-ca3c5e64c893?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash92',
    background: 'url(https://images.unsplash.com/photo-1771011466588-303b0f674910?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash93',
    background: 'url(https://images.unsplash.com/photo-1491466424936-e304919aada7?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash94',
    background: 'url(https://images.unsplash.com/photo-1528353518104-dbd48bee7bc4?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash95',
    background: 'url(https://images.unsplash.com/photo-1444080748397-f442aa95c3e5?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash96',
    background: 'url(https://images.unsplash.com/photo-1745661554426-66afd48de282?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash97',
    background: 'url(https://images.unsplash.com/photo-1701690775149-1eb93e0e3d68?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash98',
    background: 'url(https://images.unsplash.com/photo-1643330683233-ff2ac89b002c?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash99',
    background: 'url(https://images.unsplash.com/photo-1560364897-91578ff41817?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash100',
    background: 'url(https://images.unsplash.com/photo-1530053969600-caed2596d242?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash101',
    background: 'url(https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash102',
    background: 'url(https://images.unsplash.com/photo-1620121692029-d088224ddc74?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash103',
    background: 'url(https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash104',
    background: 'url(https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash105',
    background: 'url(https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash106',
    background: 'url(https://images.unsplash.com/photo-1604076913837-52ab5629fba9?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash107',
    background: 'url(https://images.unsplash.com/photo-1635776062127-d379bfcba9f8?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash108',
    background: 'url(https://images.unsplash.com/photo-1558346648-9757f2fa4474?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash109',
    background: 'url(https://images.unsplash.com/photo-1786673211400-90f79d15b1ff?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash110',
    background: 'url(https://images.unsplash.com/photo-1690049098415-29f96fca22c0?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash111',
    background: 'url(https://images.unsplash.com/photo-1533134486753-c833f0ed4866?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash112',
    background: 'url(https://images.unsplash.com/photo-1542401886-65d6c61db217?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash113',
    background: 'url(https://images.unsplash.com/photo-1488197047962-b48492212cda?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash114',
    background: 'url(https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash115',
    background: 'url(https://images.unsplash.com/photo-1493515322954-4fa727e97985?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash116',
    background: 'url(https://images.unsplash.com/photo-1771582115462-70fc0c435b96?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash117',
    background: 'url(https://images.unsplash.com/photo-1511634829096-045a111727eb?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash118',
    background: 'url(https://images.unsplash.com/photo-1643287146701-93c795880dda?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash119',
    background: 'url(https://images.unsplash.com/photo-1530049478161-0780526964f4?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash120',
    background: 'url(https://images.unsplash.com/photo-1511866743076-07ec68f015df?w=1200&q=80)',
    isImage: true,
  },
  {
    id: 'unsplash121',
    background: 'url(https://images.unsplash.com/photo-1503431128871-cd250803fa41?w=1200&q=80)',
    isImage: true,
  },
];
