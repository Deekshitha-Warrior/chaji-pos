export interface GalleryImage {
  id: number
  title: string
  description: string
  image: string
  tags: string[]
}

const BASE = '/assets/Herbal_Gallery/'

// Image 1 is always the Store Front hero — first in array, dominant in all layouts.
export const galleryImages: GalleryImage[] = [
  {
    id: 1,
    title: 'Our Store',
    description: 'CHAJI MENS WEAR in Sevoor, Arani',
    image: BASE + 'WhatsApp Image 2026-06-06 at 7.55.33 AM.jpeg',
    tags: ['store', 'front', 'heritage'],
  },
  {
    id: 2,
    title: 'Herbal Products',
    description: 'Curated menswear, clothing collections, and accessories',
    image: BASE + 'WhatsApp Image 2026-06-06 at 7.55.33 AM (1).jpeg',
    tags: ['products', 'herbal'],
  },
  {
    id: 3,
    title: 'Traditional Remedies',
    description: 'Time-tested remedies prepared with ancient wisdom',
    image: BASE + 'WhatsApp Image 2026-06-06 at 7.55.33 AM (2).jpeg',
    tags: ['remedies', 'traditional'],
  },
  {
    id: 4,
    title: 'Pooja Collection',
    description: 'Premium pooja items for sacred rituals',
    image: BASE + 'WhatsApp Image 2026-06-06 at 7.55.34 AM.jpeg',
    tags: ['pooja', 'ritual'],
  },
  {
    id: 5,
    title: 'Herb Storage',
    description: 'Carefully stored herbs maintaining freshness and potency',
    image: BASE + 'WhatsApp Image 2026-06-06 at 7.55.34 AM (1).jpeg',
    tags: ['herbs', 'storage'],
  },
  {
    id: 6,
    title: 'Authentic Spices',
    description: 'Sourced directly from farms across Tamil Nadu',
    image: BASE + 'WhatsApp Image 2026-06-06 at 7.55.34 AM (2).jpeg',
    tags: ['spices', 'authentic'],
  },
  {
    id: 7,
    title: 'Heritage Shelves',
    description: 'Decades of heritage reflected in every corner',
    image: BASE + 'WhatsApp Image 2026-06-06 at 7.55.34 AM (3).jpeg',
    tags: ['heritage', 'store'],
  },
  {
    id: 8,
    title: 'Natural Oils',
    description: 'Cold-pressed oils for health and ritual use',
    image: BASE + 'WhatsApp Image 2026-06-06 at 7.55.35 AM.jpeg',
    tags: ['oils', 'natural'],
  },
  {
    id: 9,
    title: 'Herbal Powders',
    description: 'Freshly ground herbal powders with full potency',
    image: BASE + 'WhatsApp Image 2026-06-06 at 7.55.35 AM (1).jpeg',
    tags: ['powders', 'herbal'],
  },
  {
    id: 10,
    title: 'Store Interior',
    description: 'A welcoming space where tradition meets quality',
    image: BASE + 'WhatsApp Image 2026-06-06 at 7.55.35 AM (2).jpeg',
    tags: ['store', 'interior'],
  },
  {
    id: 11,
    title: 'Sacred Products',
    description: 'Vibhoothi, Kungumam and ritual essentials',
    image: BASE + 'WhatsApp Image 2026-06-06 at 7.55.36 AM.jpeg',
    tags: ['pooja', 'sacred'],
  },
  {
    id: 12,
    title: 'Product Quality',
    description: 'Every product hand-checked for purity and quality',
    image: BASE + 'WhatsApp Image 2026-06-06 at 7.55.36 AM (1).jpeg',
    tags: ['quality', 'products'],
  },
  {
    id: 13,
    title: 'Aromatic Spices',
    description: 'Fragrant spices filling the store with earthy aromas',
    image: BASE + 'WhatsApp Image 2026-06-06 at 7.55.36 AM (2).jpeg',
    tags: ['spices', 'aromatic'],
  },
  {
    id: 14,
    title: 'Expert Guidance',
    description: 'Knowledgeable staff helping customers for generations',
    image: BASE + 'WhatsApp Image 2026-06-06 at 7.55.37 AM.jpeg',
    tags: ['staff', 'guidance'],
  },
  {
    id: 15,
    title: 'Ancient Wisdom',
    description: 'Thoughtful boutique service for every customer',
    image: BASE + 'WhatsApp Image 2026-06-06 at 7.55.37 AM (1).jpeg',
    tags: ['tradition', 'wisdom'],
  },
  {
    id: 16,
    title: 'Premium Selection',
    description: 'Carefully curated premium range for discerning customers',
    image: BASE + 'WhatsApp Image 2026-06-06 at 7.55.37 AM (2).jpeg',
    tags: ['premium', 'selection'],
  },
  {
    id: 17,
    title: 'Our Legacy',
    description: 'Eight decades of trust, authenticity and herbal expertise',
    image: BASE + 'WhatsApp Image 2026-06-06 at 7.55.38 AM.jpeg',
    tags: ['legacy', 'heritage'],
  },
]
