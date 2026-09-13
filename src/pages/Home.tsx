import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ShieldCheck,
  PackageCheck,
  Leaf,
  Award,
  Sparkles,
  ChevronRight,
  TrendingUp,
  Star,
  MapPin,
  Phone,
  MessageCircle,
  Send,
  ExternalLink,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useProductStore, useAuthStore } from '../store/store'
import { useLangStore } from '../store/langStore'
import ProductCard from '../components/ProductCard'
import InsideOurStore from '../components/home/InsideOurStore'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { PLACEHOLDER as PRODUCT_PLACEHOLDER } from '../lib/productImages'
import {
  BRAND_TA,
  BRAND_EN,
  BRAND_ADDRESS,
  BRAND_LOCATION_LINK,
  BRAND_WHATSAPP,
  BRAND_WHATSAPP_LINK,
} from '../lib/brand'

// ── Review type (maps to store_reviews table) ─────────────────────────
interface CustomerReview {
  id: string
  name: string
  location: string
  rating: number
  text: string
  createdAt: string
}

// localStorage fallback (only used when Supabase is not configured)
const LS_KEY = 'sreeja_bridal_customer_reviews'
function lsGetReviews(): CustomerReview[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
function lsSaveReview(r: CustomerReview) {
  const all = lsGetReviews()
  localStorage.setItem(LS_KEY, JSON.stringify([r, ...all].slice(0, 50)))
}

// ── Category collage images (3 dedicated thumbnails per category) ─────
const V2 = '/assets/Images_V2/'
const CATEGORY_COLLAGES: Record<string, [string, string, string]> = {
  'Pooja Items':         [V2 + 'Karpooram.jpeg',          V2 + 'Kungumam.jpeg',           V2 + 'Agarbatti Cycle.jpeg'],
  'Herbal Powder':       [V2 + 'Manjal Podi.jpeg',         V2 + 'Thulasi Podi.jpeg',        V2 + 'Ashwagandha Podi.jpeg'],
  'Herbal Oil':          [V2 + 'Veppa ennai.jpeg',         V2 + 'Thenga Ennai.jpeg',        V2 + 'Vilakennai Oil.jpeg'],
  'Spices & Condiments': [V2 + 'Elakkai.jpeg',             V2 + 'Pattai.jpeg',              V2 + 'Lavangam.jpeg'],
  'Grains & Pulses':     [V2 + 'Pasi Payiru.jpeg',         V2 + 'Ulundhu White.jpeg',       V2 + 'Kadalai Paruppu.jpeg'],
  'Honey & Liquids':     [V2 + 'Honey(thaen).jpeg',        V2 + 'Nei Dodla.jpeg',           V2 + 'Panneer 200ml.jpeg'],
  'Bundle Packages':     [V2 + 'Poornahuthi Saaman.jpeg',  V2 + 'Panchakavyam Liquid.jpeg', V2 + 'Sugar Diabetes Podi.jpeg'],
}
const CAT_FALLBACK: [string, string, string] = [V2 + 'Manjal Podi.jpeg', V2 + 'Thulasi Podi.jpeg', V2 + 'Ashwagandha Podi.jpeg']

const REMEDY_MAP: Record<string, { emoji: string; bg: string; border: string }> = {
  'Cold & Cough':       { emoji: '🤧', bg: '#EFF6FF', border: '#93C5FD' },
  'Digestion':          { emoji: '🌿', bg: '#F0FDF4', border: '#86EFAC' },
  'Hair Growth':        { emoji: '💆', bg: '#FFFBEB', border: '#FCD34D' },
  'Skin Care':          { emoji: '✨', bg: '#FFF1F2', border: '#FDA4AF' },
  'Immunity':           { emoji: '🛡️', bg: '#FFF7ED', border: '#FDBA74' },
  'Stress Relief':      { emoji: '🧘', bg: '#FAF5FF', border: '#C4B5FD' },
  'Temple Essentials':  { emoji: '🪔', bg: '#FFFBF0', border: '#FDE68A' },
  'Boutique Services':  { emoji: '🛍️', bg: '#F0FDF4', border: '#4ADE80' },
  'Joint Pain':         { emoji: '🦵', bg: '#F5F3FF', border: '#DDD6FE' },
  'Diabetes':           { emoji: '🩸', bg: '#F1F5F9', border: '#94A3B8' },
  'Fever':              { emoji: '🤒', bg: '#FEF2F2', border: '#FECACA' },
  'Ritual Purity':      { emoji: '🔔', bg: '#FFFBF0', border: '#FDE68A' },
  // Legacy aliases so existing product remedy tags still resolve
  'Stress':             { emoji: '🧘', bg: '#FAF5FF', border: '#C4B5FD' },
}

const TESTIMONIALS = [
  {
    name: 'Priya Krishnamurthy',
    location: 'Chennai',
    rating: 5,
    text: 'Exceptional quality and friendly service. The shopping and clothing experience was smooth from start to finish.',
    initials: 'PK',
    color: '#D4AF37',
  },
  {
    name: 'Ramesh Murugan',
    location: 'Coimbatore',
    rating: 5,
    text: 'The herbal oils are absolutely pure and give real results. Ordered multiple times and every batch smells fresh and aromatic. Best nattu marundhu shop online!',
    initials: '₹',
    color: '#8B7355',
  },
  {
    name: 'Kavitha Sundaram',
    location: 'Madurai',
    rating: 5,
    text: 'Beautiful boutique selections at reasonable prices. Customer service through WhatsApp is very responsive.',
    initials: 'KS',
    color: '#5e8c72',
  },
  {
    name: 'Anand Thiagarajan',
    location: 'Arani',
    rating: 5,
    text: 'Outstanding quality. The moringa powder and ashwagandha are the best I have ever tried. Have been recommending to all my friends and relatives. 100% authentic!',
    initials: 'AT',
    color: '#C4845C',
  },
]

export default function Home() {
  const { t, lang } = useLangStore()
  const { products, fetchProducts } = useProductStore()
  const { user } = useAuthStore()

  // ── Review state ──────────────────────────────────────────────
  const [customerReviews, setCustomerReviews] = useState<CustomerReview[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [reviewForm, setReviewForm] = useState({ name: '', location: '', rating: 5, text: '' })
  const [reviewSubmitted, setReviewSubmitted] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // ── Fetch reviews from Supabase (or localStorage fallback) ────
  const fetchReviews = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setCustomerReviews(lsGetReviews())
      setReviewsLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('store_reviews')
      .select('id, name, location, rating, review_text, created_at')
      .eq('is_approved', true)
      .order('created_at', { ascending: false })
      .limit(20)

    if (!error && data) {
      setCustomerReviews(data.map(r => ({
        id: String(r.id),
        name: String(r.name),
        location: String(r.location || 'Tamil Nadu'),
        rating: Number(r.rating),
        text: String(r.review_text),
        createdAt: String(r.created_at),
      })))
    }
    setReviewsLoading(false)
  }, [])

  useEffect(() => { void fetchReviews() }, [fetchReviews]) // eslint-disable-line react-hooks/set-state-in-effect

  // ── Submit review ─────────────────────────────────────────────
  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = reviewForm.name.trim()
    const text = reviewForm.text.trim()
    if (!name || !text) return
    setReviewError('')
    setSubmitting(true)

    if (!isSupabaseConfigured) {
      // localStorage fallback
      const r: CustomerReview = {
        id: Date.now().toString(),
        name,
        location: reviewForm.location.trim() || 'Tamil Nadu',
        rating: reviewForm.rating,
        text,
        createdAt: new Date().toISOString(),
      }
      lsSaveReview(r)
      setCustomerReviews(lsGetReviews())
      setReviewForm({ name: '', location: '', rating: 5, text: '' })
      setShowForm(false)
      setReviewSubmitted(true)
      setSubmitting(false)
      setTimeout(() => setReviewSubmitted(false), 4000)
      return
    }

    const { error } = await supabase.from('store_reviews').insert({
      user_id: user?.id || null,
      name,
      location: reviewForm.location.trim() || 'Tamil Nadu',
      rating: reviewForm.rating,
      review_text: text,
    })

    if (error) {
      setReviewError(error.message)
      setSubmitting(false)
      return
    }

    // Reload from DB so the new review is visible immediately
    await fetchReviews()
    setReviewForm(f => ({ ...f, location: '', rating: 5, text: '' }))
    setShowForm(false)
    setReviewSubmitted(true)
    setSubmitting(false)
    setTimeout(() => setReviewSubmitted(false), 4000)
  }

  useEffect(() => { void fetchProducts() }, [fetchProducts])

  const topSelling = useMemo(() =>
    products.filter(p => p.isActive).sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 4),
  [products])

  const featured = useMemo(() =>
    products
      .filter(p => p.isActive && !topSelling.some(top => top.id === p.id))
      .slice(0, 4),
  [products, topSelling])

  const derivedCats = useMemo(() => {
    const names = Array.from(new Set(products.filter(p => p.isActive).map(p => p.category))).filter(Boolean)
    return names.map(name => ({
      name,
      thumbnails: CATEGORY_COLLAGES[name] ?? CAT_FALLBACK,
      count: products.filter(p => p.isActive && p.category === name).length,
    }))
  }, [products])

  const derivedRemedies = useMemo(() => {
    const raw = Array.from(new Set(products.filter(p => p.isActive).flatMap(p => p.remedy || []))).filter(Boolean)
    return raw.map(label => ({
      label,
      ...(REMEDY_MAP[label] || { emoji: '✨', bg: '#F3F4F6', border: '#D1D5DB' }),
    }))
  }, [products])

  return (
    <div className="bg-[#F9FAFB] text-[#111111]">

      {/* ═══════════════════════════════════════════════════════════
          HERO SECTION
      ════════════════════════════════════════════════════════════ */}
      <section
        className="relative overflow-hidden flex items-center min-h-[60vh] sm:min-h-[68vh] lg:min-h-[78vh] py-10 sm:py-14"
        style={{ background: 'linear-gradient(140deg, #f4f8f1 0%, #f9f8f5 55%, #fffaf4 100%)' }}
      >
        {/* Ambient background glows — very subtle, premium feel */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden hidden sm:block">
          <div className="absolute -top-24 -right-12 w-[480px] h-[480px] rounded-full blur-[140px] opacity-[0.055]"
            style={{ background: '#D4AF37' }} />
          <div className="absolute -bottom-16 -left-16 w-[380px] h-[380px] rounded-full blur-[120px] opacity-[0.04]"
            style={{ background: '#E5E7EB' }} />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 w-full grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">

          {/* ── Left: Text Column ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Eyebrow badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-6
              bg-[#D4AF37]/10 border border-[#D4AF37]/20">
              <Sparkles size={11} className="text-[#5e8c72]" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#5e8c72]">
                {t('hero.badge')}
              </span>
            </div>

            {/* Headline — responsive to locale:
                Tamil characters are ~3× wider at the same px size as Latin,
                so we scale down and relax line-height for Tamil mode. */}
            <h1 className={`font-black mb-5 break-words ${
              lang === 'ta'
                ? 'font-sans text-[28px] sm:text-[36px] lg:text-[44px] leading-[1.45] tracking-[0] ta-text'
                : 'font-headline text-[40px] sm:text-[54px] lg:text-[66px] leading-[1.0] tracking-[-0.02em]'
            }`}>
              <span className="block text-[#111111]">{t('hero.title1')}</span>
              <span className="block text-[#D4AF37]">{t('hero.title2')}</span>
            </h1>

            {/* Subtitle */}
            <p className={`text-[15px] sm:text-[16px] text-[#374151] leading-[1.7] font-medium mb-2.5 ${
              lang === 'ta' ? 'max-w-full ta-text' : 'max-w-[420px]'
            }`}>
              {t('hero.subtitle')}
            </p>

            {/* Tamil brand name — hardcoded, not a translation key, styled as elegant accent */}
            <p className="text-[13px] sm:text-[14px] font-semibold text-[#D4AF37]/75
              tracking-[0.03em] mb-8 sm:mb-10">
              {BRAND_TA}
            </p>

            {/* CTA buttons */}
            <div className="flex flex-wrap gap-3 items-center">
              <Link
                to="/products"
                className="group inline-flex items-center gap-2.5 px-7 py-3.5
                  bg-[#111111] text-white font-bold rounded-full
                  text-[13px] sm:text-[14px]
                  shadow-[0_4px_22px_rgba(44,57,42,0.28)]
                  hover:bg-[#1e2817]
                  hover:shadow-[0_8px_32px_rgba(44,57,42,0.38)]
                  hover:-translate-y-px
                  transition-all duration-200"
              >
                <ShieldCheck size={14} />
                {t('common.shopNow')}
                <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform duration-200" />
              </Link>

              <a
                href="#concerns"
                className="inline-flex items-center gap-2 px-6 py-3.5
                  bg-white text-[#111111] font-semibold rounded-full
                  border border-[#111111]/10
                  text-[13px] sm:text-[14px]
                  shadow-sm
                  hover:bg-[#F9FAFB] hover:border-[#111111]/20
                  transition-all duration-200"
              >
                <Leaf size={13} className="text-[#D4AF37]" />
                {t('remedy.title')}
              </a>
            </div>
          </motion.div>

          {/* ── Right: Video / Image Column ── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex justify-center lg:justify-end"
          >
            {/* Main video container */}
            <div className="relative w-full max-w-[620px] aspect-video rounded-[2rem] overflow-hidden
              shadow-[0_28px_80px_rgba(44,57,42,0.22)]
              ring-1 ring-white/25">
              <video
                src="/Add_shoot_video_202604072031.mp4"
                className="w-full h-full object-cover"
                autoPlay muted loop playsInline
                poster="/chaji-logo.png"
              />
              {/* Subtle bottom vignette for depth */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#111111]/10 via-transparent to-transparent pointer-events-none" />
            </div>

            {/* ─ Floating card: top-right — Organic badge ─ */}
            <motion.div
              animate={{ y: [0, -7, 0] }}
              transition={{ repeat: Infinity, duration: 4.2, ease: 'easeInOut' }}
              className="absolute -right-3 sm:-right-5 top-6 hidden md:block"
            >
              <div className="bg-white rounded-2xl px-4 py-3.5
                shadow-[0_6px_28px_rgba(44,57,42,0.11)]
                border border-[#E5E7EB]/50
                flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#D4AF37] flex items-center justify-center shrink-0">
                  <Leaf size={14} className="text-white" />
                </div>
                <div>
                  <p className="text-[12px] font-black text-[#111111] leading-tight">100% Natural</p>
                  <p className="text-[10px] text-[#374151] font-medium mt-0.5">Boutique Service</p>
                </div>
              </div>
            </motion.div>

            {/* ─ Floating card: bottom-left — Social proof ─ */}
            <motion.div
              animate={{ y: [0, 7, 0] }}
              transition={{ repeat: Infinity, duration: 5.2, ease: 'easeInOut', delay: 0.9 }}
              className="absolute -left-3 sm:-left-5 bottom-6 hidden md:block"
            >
              <div className="bg-white rounded-2xl px-4 py-3.5
                shadow-[0_6px_28px_rgba(44,57,42,0.11)]
                border border-[#E5E7EB]/50">
                <div className="flex items-center gap-0.5 mb-1.5">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Star key={i} size={11} className="text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-[13px] font-black text-[#111111] leading-tight">4.9 / 5.0</p>
                <p className="text-[10px] text-[#374151] font-medium mt-0.5">Happy Customers</p>
              </div>
            </motion.div>

          </motion.div>
        </div>
      </section>

      {/* ═══ TRUST BADGES ═══ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 -mt-8 sm:-mt-10 relative z-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {[
            { icon: <ShieldCheck size={17} />, title: t('trust.organic'),  sub: t('trust.organic_sub')  },
            { icon: <PackageCheck size={17} />, title: t('trust.shipping'), sub: t('trust.shipping_sub') },
            { icon: <Leaf size={17} />,         title: t('trust.pure'),     sub: t('trust.pure_sub')     },
            { icon: <Award size={17} />,        title: t('trust.gmp'),      sub: t('trust.gmp_sub')      },
          ].map((item, idx) => (
            <div key={idx}
              className="flex items-center gap-3.5 p-4 sm:p-5
                bg-white rounded-2xl
                border border-[#E5E7EB]/35
                shadow-sm
                hover:-translate-y-0.5 transition-transform duration-200"
            >
              <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/12 flex items-center justify-center shrink-0 text-[#D4AF37]">
                {item.icon}
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-[12px] sm:text-[13px] text-[#111111] leading-normal ta-text">{item.title}</h4>
                <p className="text-[10px] text-[#374151] font-medium mt-0.5 leading-normal ta-text">{item.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ SHOP BY CATEGORIES ═══ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="flex justify-between items-end mb-10">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D4AF37] mb-2">Browse Collection</p>
            <h2 className={`font-black text-[#111111] break-words ${lang === 'ta' ? 'text-2xl sm:text-[30px] leading-[1.4] tracking-[0] ta-text' : 'text-3xl sm:text-[38px] tracking-tight'}`}>{t('cat.title')}</h2>
          </div>
          <Link to="/products"
            className="text-[13px] font-bold text-[#D4AF37] flex items-center gap-1 group hover:text-[#5e8c72] transition-colors">
            {t('cat.view_all')}
            <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {/* Mobile: horizontal swipe  |  Tablet: 4-col grid  |  Desktop: 7-col strip */}
        <div className="
          flex gap-3 overflow-x-auto pb-3 -mx-4 px-4 snap-x snap-mandatory
          sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-4 sm:gap-4 sm:overflow-x-clip
          lg:grid-cols-7 lg:gap-5
        ">
          {derivedCats.slice(0, 6).map((c, idx) => (
            <motion.div
              key={idx}
              className="shrink-0 w-36 snap-start sm:shrink sm:w-auto"
              whileHover={{ y: -4 }}
              transition={{ type: 'spring', stiffness: 340, damping: 24 }}
            >
              <Link to={`/products?cat=${encodeURIComponent(c.name)}`} className="flex flex-col items-center group">
                {/* Collage: large left image + two stacked right images */}
                <div className="w-full aspect-square rounded-2xl overflow-hidden relative
                  border border-[#E5E7EB]/30 shadow-sm
                  group-hover:shadow-[0_8px_28px_rgba(44,57,42,0.16)]
                  transition-shadow duration-300 mb-2.5">
                  <div className="grid h-full gap-px" style={{ gridTemplateColumns: '60% 40%' }}>
                    <div className="overflow-hidden">
                      <img src={c.thumbnails[0]} alt="" loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.07]" />
                    </div>
                    <div className="grid gap-px" style={{ gridTemplateRows: '1fr 1fr' }}>
                      <div className="overflow-hidden">
                        <img src={c.thumbnails[1]} alt="" loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.07]" />
                      </div>
                      <div className="overflow-hidden">
                        <img src={c.thumbnails[2]} alt="" loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.07]" />
                      </div>
                    </div>
                  </div>
                  {/* Hover overlay with product count badge */}
                  <div className="absolute inset-0 flex items-center justify-center
                    bg-[#111111]/0 group-hover:bg-[#111111]/30 transition-colors duration-300">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300
                      bg-white/95 text-[#111111] text-[11px] font-black px-3 py-1.5 rounded-full
                      shadow-[0_2px_12px_rgba(44,57,42,0.18)]">
                      {c.count} items
                    </span>
                  </div>
                </div>
                <span className="text-[10px] sm:text-[11px] font-bold text-[#111111] text-center leading-tight
                  group-hover:text-[#D4AF37] transition-colors duration-200">
                  {c.name}
                </span>
              </Link>
            </motion.div>
          ))}

          {/* All Products tile */}
          <motion.div
            className="shrink-0 w-36 snap-start sm:shrink sm:w-auto"
            whileHover={{ y: -4 }}
            transition={{ type: 'spring', stiffness: 340, damping: 24 }}
          >
            <Link to="/products" className="flex flex-col items-center group">
              <div className="w-full aspect-square rounded-2xl bg-[#111111] flex items-center justify-center
                shadow-sm group-hover:shadow-[0_8px_28px_rgba(44,57,42,0.22)] transition-shadow duration-300 mb-2.5">
                <div className="text-center">
                  <ChevronRight size={26} className="text-white mx-auto mb-1 opacity-90" />
                  <p className="text-white text-[9px] font-black uppercase tracking-wider opacity-75">All</p>
                </div>
              </div>
              <span className="text-[10px] sm:text-[11px] font-bold text-[#111111] text-center leading-tight
                group-hover:text-[#D4AF37] transition-colors duration-200">
                All Products
              </span>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ═══ INSIDE OUR STORE ═══ */}
      <InsideOurStore />

      {/* ═══ HEALTH CONCERNS ═══ */}
      <section id="concerns" className="bg-white py-16 sm:py-24 border-y border-[#E5E7EB]/30 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <div className="mb-12">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D4AF37]">{t('remedy.badge')}</p>
            <h2 className={`font-black mt-3 mb-3 text-[#111111] break-words ${lang === 'ta' ? 'text-2xl sm:text-[30px] leading-[1.4] tracking-[0] ta-text' : 'text-3xl sm:text-[38px] tracking-tight'}`}>{t('remedy.title')}</h2>
            <p className={`text-[15px] text-[#374151] mx-auto font-medium leading-relaxed ${lang === 'ta' ? 'max-w-full ta-text' : 'max-w-xl'}`}>{t('remedy.sub')}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {derivedRemedies.map((r, idx) => (
              <Link
                key={idx}
                to={`/products?remedy=${encodeURIComponent(r.label)}`}
                style={{ background: r.bg, borderColor: r.border }}
                className="inline-flex items-center gap-2.5 px-5 py-3 rounded-2xl
                  border-2 shadow-sm
                  hover:scale-[1.03] hover:shadow-md
                  transition-all duration-200 group"
              >
                <span className="text-[18px] group-hover:scale-110 transition-transform duration-200">{r.emoji}</span>
                <span className="font-bold text-[13px] text-[#111111]">{t('remedy.' + r.label)}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ TOP SELLING ═══ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="flex justify-between items-center mb-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 shrink-0">
              <TrendingUp size={19} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#D4AF37]">Customer Favourites</p>
              <h2 className={`font-black text-[#111111] break-words ${lang === 'ta' ? 'text-xl sm:text-2xl leading-[1.4] tracking-[0] ta-text' : 'text-2xl sm:text-3xl tracking-tight'}`}>{t('top.title')}</h2>
            </div>
          </div>
          <Link to="/products"
            className="text-[13px] font-bold text-[#D4AF37] hover:text-[#5e8c72] flex items-center gap-1 transition-colors">
            {t('cat.view_all')} <ChevronRight size={15} />
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {topSelling.map(p => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* ═══ TESTIMONIALS + CUSTOMER REVIEWS ═══ */}
      <section className="bg-white py-16 sm:py-24 border-y border-[#E5E7EB]/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-12">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D4AF37]">Customer Reviews</p>
              <h2 className="text-3xl sm:text-[38px] font-black mt-3 mb-2 tracking-tight text-[#111111]">
                Trusted by Thousands
              </h2>
              <p className="text-[14px] text-[#374151] max-w-md font-medium leading-relaxed">
                Real results from real customers across Tamil Nadu
              </p>
            </div>
            <button
              onClick={() => setShowForm(v => !v)}
              className="shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-xl
                bg-[#111111] text-white font-bold text-[13px]
                hover:bg-[#1e2817] transition-colors"
            >
              <Star size={14} className="fill-amber-300 text-amber-300" />
              Write a Review
            </button>
          </div>

          {/* Success toast */}
          <AnimatePresence>
            {reviewSubmitted && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-6 bg-green-50 border border-green-200 text-green-700 px-5 py-3.5 rounded-xl text-sm font-bold"
              >
                ✅ Thank you! Your review has been posted.
              </motion.div>
            )}
          </AnimatePresence>

          {/* Review form */}
          <AnimatePresence>
            {showForm && (
              <motion.form
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={handleReviewSubmit}
                className="mb-10 bg-[#F9FAFB] rounded-2xl p-6 border border-[#E5E7EB]/40 overflow-hidden"
              >
                <h3 className="font-bold text-[#111111] mb-5 text-[15px]">Share Your Experience</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-bold text-[#374151] mb-1.5 uppercase tracking-wide">Your Name *</label>
                    <input
                      required
                      placeholder="e.g. Priya S."
                      className="w-full px-4 py-2.5 rounded-xl border-2 border-[#E5E7EB] focus:border-[#D4AF37] outline-none bg-white text-[13px]"
                      value={reviewForm.name}
                      onChange={e => setReviewForm(f => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#374151] mb-1.5 uppercase tracking-wide">City / Location</label>
                    <input
                      placeholder="e.g. Chennai"
                      className="w-full px-4 py-2.5 rounded-xl border-2 border-[#E5E7EB] focus:border-[#D4AF37] outline-none bg-white text-[13px]"
                      value={reviewForm.location}
                      onChange={e => setReviewForm(f => ({ ...f, location: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-bold text-[#374151] mb-2 uppercase tracking-wide">Rating *</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setReviewForm(f => ({ ...f, rating: n }))}
                        className="transition-transform hover:scale-110"
                      >
                        <Star
                          size={28}
                          className={n <= reviewForm.rating ? 'fill-amber-400 text-amber-400' : 'text-[#D1C9B8]'}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-5">
                  <label className="block text-xs font-bold text-[#374151] mb-1.5 uppercase tracking-wide">Your Review *</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Tell others about your experience with our products..."
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-[#E5E7EB] focus:border-[#D4AF37] outline-none bg-white text-[13px] resize-none"
                    value={reviewForm.text}
                    onChange={e => setReviewForm(f => ({ ...f, text: e.target.value }))}
                  />
                </div>

                {reviewError && (
                  <p className="text-red-600 text-[12px] font-bold bg-red-50 px-3 py-2 rounded-xl">{reviewError}</p>
                )}

                <div className="flex gap-3">
                  <button type="submit" disabled={submitting}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#5e8c72] text-white font-bold text-[13px] transition-colors disabled:opacity-60">
                    {submitting
                      ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Posting…</>
                      : <><Send size={14} /> Post Review</>
                    }
                  </button>
                  <button type="button" onClick={() => { setShowForm(false); setReviewError('') }}
                    className="px-5 py-2.5 rounded-xl border-2 border-[#E5E7EB] text-[#374151] font-bold text-[13px] hover:bg-[#F9FAFB] transition-colors">
                    Cancel
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Reviews loading skeleton */}
          {reviewsLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-[#F9FAFB] rounded-2xl p-5 border border-[#E5E7EB]/30 animate-pulse">
                  <div className="h-3 bg-[#E5E7EB] rounded w-24 mb-4" />
                  <div className="h-2.5 bg-[#E5E7EB] rounded w-full mb-2" />
                  <div className="h-2.5 bg-[#E5E7EB] rounded w-4/5 mb-2" />
                  <div className="h-2.5 bg-[#E5E7EB] rounded w-3/5" />
                </div>
              ))}
            </div>
          )}

          {/* Hardcoded + customer reviews grid */}
          {!reviewsLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {TESTIMONIALS.map((review, idx) => (
              <motion.div
                key={`static-${idx}`}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: idx * 0.08 }}
                className="bg-[#F9FAFB] rounded-2xl p-5 sm:p-6 border border-[#E5E7EB]/30 flex flex-col gap-3.5 hover:shadow-md transition-shadow duration-300"
              >
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: review.rating }).map((_, i) => (
                    <Star key={i} size={13} className="text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-[13px] text-[#374151] leading-[1.65] flex-grow">&ldquo;{review.text}&rdquo;</p>
                <div className="flex items-center gap-2.5 pt-3 border-t border-[#E5E7EB]/40">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-black shrink-0"
                    style={{ backgroundColor: review.color }}>
                    {review.initials}
                  </div>
                  <div>
                    <p className="font-bold text-[12px] text-[#111111] leading-tight">{review.name}</p>
                    <p className="text-[10px] text-[#374151] mt-0.5">{review.location}</p>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Customer-submitted reviews from Supabase */}
            {customerReviews.slice(0, 8).map((review) => {
              const colors = ['#D4AF37', '#C4845C', '#8B7355', '#5e8c72']
              const color = colors[review.name.charCodeAt(0) % colors.length]
              return (
                <motion.div
                  key={review.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-[#F9FAFB] rounded-2xl p-5 sm:p-6 border border-[#D4AF37]/20 flex flex-col gap-3.5 hover:shadow-md transition-shadow duration-300"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: review.rating }).map((_, i) => (
                        <Star key={i} size={13} className="text-amber-400 fill-amber-400" />
                      ))}
                    </div>
                    <span className="text-[9px] font-bold text-[#D4AF37] bg-[#D4AF37]/10 px-2 py-0.5 rounded-full">Verified</span>
                  </div>
                  <p className="text-[13px] text-[#374151] leading-[1.65] flex-grow">&ldquo;{review.text}&rdquo;</p>
                  <div className="flex items-center gap-2.5 pt-3 border-t border-[#E5E7EB]/40">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-black shrink-0"
                      style={{ backgroundColor: color }}>
                      {review.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-[12px] text-[#111111] leading-tight">{review.name}</p>
                      <p className="text-[10px] text-[#374151] mt-0.5">{review.location}</p>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
          )} {/* end !reviewsLoading */}
        </div>
      </section>

      {/* ═══ FEATURED BANNER ═══ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="relative rounded-[2rem] overflow-hidden bg-[#111111] text-white
          p-10 sm:p-14 lg:p-20
          shadow-[0_24px_80px_rgba(44,57,42,0.28)]">
          <div className="absolute inset-0 opacity-[0.09] pointer-events-none">
            <img
              src={PRODUCT_PLACEHOLDER}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#111111] via-[#111111]/80 to-transparent pointer-events-none" />

          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full
              bg-white/10 border border-white/15 mb-6">
              <Sparkles size={11} className="text-[#B2C7A5]" />
              <span className="text-[9px] font-black uppercase tracking-[0.22em] text-white/75">
                {t('banner.badge')}
              </span>
            </div>
            <h2 className={`font-black mb-5 break-words ${
              lang === 'ta'
                ? 'text-[26px] sm:text-[34px] lg:text-[42px] leading-[1.45] tracking-[0] ta-text'
                : 'text-[36px] sm:text-5xl lg:text-[58px] leading-[1.05] tracking-tight'
            }`}>
              {t('banner.title')}
            </h2>
            <p className={`text-[14px] sm:text-[16px] text-white/65 mb-10 font-medium leading-relaxed ${
              lang === 'ta' ? 'max-w-full ta-text' : 'max-w-sm'
            }`}>
              {t('banner.sub')}
            </p>
            <Link
              to="/products"
              className="inline-flex items-center gap-2.5 px-9 py-4
                bg-white text-[#111111] font-black rounded-2xl
                hover:bg-[#F9FAFB] hover:scale-[1.02]
                transition-all duration-200
                shadow-[0_4px_20px_rgba(0,0,0,0.2)]
                text-[13px] sm:text-[14px]"
            >
              {t('banner.cta')} <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ GOOGLE MAP LOCATION ═══ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 items-stretch">
          {/* Map — tap-to-open card (avoids wrong-location iframe embedding) */}
          <a
            href={BRAND_LOCATION_LINK}
            target="_blank"
            rel="noreferrer"
            className="group relative rounded-[2rem] overflow-hidden
              border border-[#E5E7EB]/40 shadow-sm
              min-h-[280px] sm:min-h-[340px] block
              bg-gradient-to-br from-[#eaf2e5] to-[#d4e8d0]"
          >
            {/* Decorative map-like grid */}
            <div className="absolute inset-0 opacity-10"
              style={{ backgroundImage: 'linear-gradient(#111111 1px, transparent 1px), linear-gradient(90deg, #111111 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            {/* Center pin */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
              <div className="w-16 h-16 rounded-full bg-[#111111] flex items-center justify-center shadow-xl
                group-hover:scale-110 transition-transform duration-300">
                <MapPin size={30} className="text-white" />
              </div>
              <div className="text-center">
                <p className="font-black text-[#111111] text-[15px]">{BRAND_EN}</p>
                <p className="text-[#374151] text-[12px] mt-1">Tamil Nadu, India</p>
              </div>
              <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl
                bg-[#111111] text-white text-[12px] font-bold
                group-hover:bg-[#D4AF37] transition-colors duration-300">
                <ExternalLink size={12} /> Open in Google Maps
              </div>
            </div>
          </a>

          {/* Info card */}
          <div className="bg-white rounded-[2rem] p-8 sm:p-10
            border border-[#E5E7EB]/40 shadow-sm
            flex flex-col justify-between gap-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D4AF37]">Find Us</p>
              <h2 className="text-2xl sm:text-3xl font-black mt-2.5 mb-4 text-[#111111] tracking-tight">
                Visit Our Store
              </h2>
              <p className="text-[#374151] text-[14px] leading-[1.7] font-medium mb-6">
                Visit {BRAND_EN} in Sevoor, Arani for premium men's &amp; women's clothing, apparel, and custom fashion collections. Our team will help you find the right fit for your needs.
              </p>

              <div className="space-y-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/12 flex items-center justify-center shrink-0">
                    <MapPin size={16} className="text-[#D4AF37]" />
                  </div>
                  <div>
                    <p className="font-bold text-[13px] text-[#111111] leading-tight">Store Location</p>
                    <p className="text-[13px] text-[#374151] mt-0.5">{BRAND_ADDRESS}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/12 flex items-center justify-center shrink-0">
                    <Phone size={16} className="text-[#D4AF37]" />
                  </div>
                  <div>
                    <p className="font-bold text-[13px] text-[#111111] leading-tight">Call / WhatsApp</p>
                    <p className="text-[13px] text-[#374151] mt-0.5">{BRAND_WHATSAPP}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href={BRAND_LOCATION_LINK}
                target="_blank"
                rel="noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2
                  px-5 py-3.5
                  bg-[#111111] text-white font-bold rounded-xl
                  hover:bg-[#1e2817] transition-colors
                  text-[13px]"
              >
                <MapPin size={14} /> Get Directions
              </a>
              <a
                href={BRAND_WHATSAPP_LINK}
                target="_blank"
                rel="noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2
                  px-5 py-3.5
                  bg-[#25D366] hover:bg-[#1eb858] text-white font-bold rounded-xl
                  transition-colors
                  text-[13px]"
              >
                <MessageCircle size={14} /> WhatsApp Us
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ MORE PRODUCTS ═══ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24 text-center">
        <h2 className={`font-black mb-8 text-[#111111] break-words ${lang === 'ta' ? 'text-xl sm:text-2xl leading-[1.4] tracking-[0] ta-text' : 'text-2xl sm:text-3xl tracking-tight'}`}>
          {t('more.title')}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5 mb-10">
          {featured.map(p => <ProductCard key={p.id} product={p} />)}
        </div>
        <Link
          to="/products"
          className="inline-flex items-center gap-2.5 px-10 py-4 rounded-full
            bg-[#D4AF37] text-white font-black
            shadow-[0_4px_20px_rgba(125,170,143,0.35)]
            hover:bg-[#5e8c72] hover:scale-[1.02] hover:shadow-[0_6px_28px_rgba(125,170,143,0.45)]
            transition-all duration-200
            text-[13px] sm:text-[14px]"
        >
          {t('more.cta')} <ArrowRight size={16} />
        </Link>
      </section>

    </div>
  )
}
