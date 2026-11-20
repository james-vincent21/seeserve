/**
 * Fictional restaurant used for the demo ("Dhaka Table House"). Not a real business.
 * Prices are in BDT. cost_price is the ingredient cost per portion.
 */
export const branches = [
  { id: 'gulshan', name: 'Dhaka Table House · Gulshan', address: 'Road 11, Gulshan 2, Dhaka', lat: 23.7925, lng: 90.4078, phone: '+880 1700-000001' },
  { id: 'dhanmondi', name: 'Dhaka Table House · Dhanmondi', address: 'Road 27, Dhanmondi, Dhaka', lat: 23.7461, lng: 90.3742, phone: '+880 1700-000002' },
  { id: 'uttara', name: 'Dhaka Table House · Uttara', address: 'Sector 7, Uttara, Dhaka', lat: 23.8759, lng: 90.3795, phone: '+880 1700-000003' },
] as const;

export const openingHours = { daily: '12:00-23:00', iftarSpecial: 'Ramadan: from 17:00' };

/** Gulshan keeps the CCTV demo ids table-1..table-6 so the vision demo maps onto the same tables. */
export const tables: Array<{ id: string; label: string; branchId: string; capacity: number }> = [
  ...[4, 5, 4, 2, 6, 4].map((capacity, index) => ({ id: `table-${index + 1}`, label: `Table ${index + 1}`, branchId: 'gulshan', capacity })),
  ...[4, 4, 2, 6, 4].map((capacity, index) => ({ id: `dhn-${index + 1}`, label: `Table ${index + 1}`, branchId: 'dhanmondi', capacity })),
  ...[4, 2, 4, 6, 4].map((capacity, index) => ({ id: `utt-${index + 1}`, label: `Table ${index + 1}`, branchId: 'uttara', capacity })),
];

export interface MenuSeed {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  cost: number;
  prep: number;
  tags: string[];
  /** Relative popularity used only by the synthetic order generator. */
  weight: number;
}

export const menu: MenuSeed[] = [
  { id: 'fuchka', name: 'Fuchka Platter', category: 'Starters', description: 'Crisp semolina shells with spiced potato, tamarind water.', price: 220, cost: 70, prep: 6, tags: ['vegetarian', 'street-food'], weight: 9 },
  { id: 'beguni', name: 'Beguni & Chutney', category: 'Starters', description: 'Gram-flour battered aubergine with green chutney.', price: 180, cost: 55, prep: 8, tags: ['vegetarian', 'iftar'], weight: 6 },
  { id: 'chicken-soup', name: 'Thai Chicken Soup', category: 'Starters', description: 'Lemongrass and galangal broth with chicken.', price: 320, cost: 110, prep: 10, tags: [], weight: 5 },
  { id: 'kacchi', name: 'Mutton Kacchi Biryani', category: 'Rice & Biryani', description: 'Slow-cooked aromatic rice with marinated mutton and potato.', price: 520, cost: 230, prep: 5, tags: ['signature'], weight: 14 },
  { id: 'chicken-biryani', name: 'Chicken Biryani', category: 'Rice & Biryani', description: 'Basmati rice layered with spiced chicken.', price: 380, cost: 150, prep: 5, tags: [], weight: 10 },
  { id: 'khichuri', name: 'Bhuna Khichuri with Beef', category: 'Rice & Biryani', description: 'Rice and lentils cooked with beef curry — a rainy-day favourite.', price: 420, cost: 170, prep: 7, tags: ['rainy-day'], weight: 6 },
  { id: 'plain-polao', name: 'Plain Polao', category: 'Rice & Biryani', description: 'Fragrant ghee rice.', price: 150, cost: 45, prep: 4, tags: ['vegetarian'], weight: 7 },
  { id: 'beef-rezala', name: 'Beef Rezala', category: 'Mains', description: 'Mild yoghurt and cashew gravy with tender beef.', price: 480, cost: 210, prep: 14, tags: [], weight: 7 },
  { id: 'hilsa', name: 'Shorshe Ilish', category: 'Mains', description: 'Hilsa in mustard sauce, served with rice.', price: 690, cost: 400, prep: 18, tags: ['seasonal', 'fish'], weight: 5 },
  { id: 'prawn-malai', name: 'Chingri Malai Curry', category: 'Mains', description: 'Prawns in coconut milk curry.', price: 650, cost: 330, prep: 16, tags: ['seafood'], weight: 4 },
  { id: 'dal', name: 'Dal Makhani', category: 'Mains', description: 'Black lentils simmered overnight with butter.', price: 260, cost: 70, prep: 9, tags: ['vegetarian'], weight: 6 },
  { id: 'lobster', name: 'Lobster Thermidor', category: 'Mains', description: 'Imported lobster, creamy mustard sauce, gratinated.', price: 2400, cost: 2150, prep: 28, tags: ['premium'], weight: 0.4 },
  { id: 'chicken-tikka', name: 'Chicken Tikka', category: 'Grill', description: 'Charcoal-grilled chicken with mint sauce.', price: 420, cost: 160, prep: 15, tags: [], weight: 8 },
  { id: 'beef-seekh', name: 'Beef Seekh Kebab', category: 'Grill', description: 'Minced beef skewers off the charcoal grill.', price: 450, cost: 180, prep: 14, tags: [], weight: 6 },
  { id: 'grilled-fish', name: 'Grilled Rupchanda', category: 'Grill', description: 'Whole pomfret grilled with lemon butter.', price: 620, cost: 330, prep: 20, tags: ['fish'], weight: 3 },
  { id: 'naan', name: 'Butter Naan', category: 'Breads', description: 'Tandoor-baked flatbread.', price: 70, cost: 15, prep: 5, tags: ['vegetarian'], weight: 12 },
  { id: 'firni', name: 'Firni', category: 'Desserts', description: 'Rice pudding with cardamom and pistachio.', price: 160, cost: 45, prep: 3, tags: ['vegetarian'], weight: 7 },
  { id: 'mishti-doi', name: 'Mishti Doi', category: 'Desserts', description: 'Sweet caramelised yoghurt from Bogura.', price: 140, cost: 50, prep: 2, tags: ['vegetarian'], weight: 8 },
  { id: 'molten-cake', name: 'Chocolate Molten Cake', category: 'Desserts', description: 'Warm chocolate cake with vanilla ice cream.', price: 380, cost: 150, prep: 12, tags: [], weight: 3 },
  { id: 'borhani', name: 'Borhani', category: 'Drinks', description: 'Spiced yoghurt drink, best with kacchi.', price: 120, cost: 30, prep: 2, tags: ['vegetarian'], weight: 11 },
  { id: 'lemon-mint', name: 'Lemon Mint Cooler', category: 'Drinks', description: 'Fresh lime, mint and soda.', price: 160, cost: 35, prep: 3, tags: ['vegetarian'], weight: 9 },
  { id: 'cha', name: 'Masala Cha', category: 'Drinks', description: 'Milk tea with ginger and cardamom.', price: 90, cost: 20, prep: 4, tags: ['vegetarian'], weight: 8 },
  { id: 'cold-coffee', name: 'Cold Coffee', category: 'Drinks', description: 'Blended iced coffee.', price: 220, cost: 70, prep: 4, tags: ['vegetarian'], weight: 5 },
];

/** Monthly overheads per branch (BDT), used for profit and loss. */
export const monthlyOverheads: Record<string, Array<{ category: string; amount: number }>> = {
  gulshan: [{ category: 'rent', amount: 450000 }, { category: 'salaries', amount: 520000 }, { category: 'utilities', amount: 90000 }],
  dhanmondi: [{ category: 'rent', amount: 300000 }, { category: 'salaries', amount: 420000 }, { category: 'utilities', amount: 70000 }],
  uttara: [{ category: 'rent', amount: 260000 }, { category: 'salaries', amount: 380000 }, { category: 'utilities', amount: 65000 }],
};
