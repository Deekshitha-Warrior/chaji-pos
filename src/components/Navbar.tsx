import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ShoppingCart, Heart, Search, Menu, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCartStore, useFavStore, useAuthStore } from '../store/store'
import { useLangStore } from '../store/langStore'
import { CartDrawer, FavoritesDrawer } from './Drawers'
import { BRAND_EN, BRAND_SUBTITLE, BRAND_WHATSAPP, BRAND_LOGO, BRAND_ICON } from '../lib/brand'

export default function Navbar() {
  const [query, setQuery] = useState('')
  const [showCart, setShowCart] = useState(false)
  const [showFav, setShowFav] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()
  const count = useCartStore(s => s.count())
  const favCount = useFavStore(s => s.items.length)
  const user = useAuthStore((s) => s.user)
  const isAdmin = useAuthStore((s) => s.isAdmin())
  const logout = useAuthStore((s) => s.logout)
  const { t, lang, setLang } = useLangStore()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) { navigate(`/products?search=${encodeURIComponent(query.trim())}`); setMobileOpen(false) }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 bg-forestDark/95 px-3 py-2 text-center text-[11px] sm:text-xs font-medium tracking-wide text-sage shadow-soft">
        <span className="leading-snug">
          🌿 {t('nav.free_shipping')} &nbsp;·&nbsp; <span className="whitespace-nowrap">WhatsApp: {BRAND_WHATSAPP}</span>
        </span>
        <button onClick={() => setLang(lang === 'en' ? 'ta' : 'en')} className="hidden sm:inline-flex items-center rounded-full bg-white/8 p-0.5 text-[10px] font-bold text-white transition-colors shadow-soft">
          <span className={`px-2 py-0.5 rounded-full transition-colors ${lang === 'en' ? 'bg-white text-forestDark' : 'text-white/70'}`}>EN</span>
          <span className={`px-2 py-0.5 rounded-full transition-colors ${lang === 'ta' ? 'bg-white text-forestDark' : 'text-white/70'}`}>தமிழ்</span>
        </button>
      </div>

      <header className="sticky top-0 z-40 glass border-b border-sand/40 shadow-sm">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-2 sm:gap-3 px-3 py-2.5 sm:px-4 sm:py-3 lg:gap-4">
          <Link to="/" className="group flex min-w-0 items-center gap-2 sm:gap-2.5">
            <div className="w-10 h-10 sm:w-11 sm:h-11 bg-[#0A0A0A] rounded-full flex items-center justify-center overflow-hidden shadow-sm shrink-0 border border-[#D4AF37]/50 group-hover:opacity-90 transition-opacity p-1">
              <img src={BRAND_ICON} alt={BRAND_EN} className="w-full h-full object-contain" />
            </div>
            <div className="flex min-w-0 flex-col leading-none">
              <p className="break-words text-[12px] sm:text-[13px] font-bold leading-tight tracking-tight text-textMain md:text-[15px] font-headline">{BRAND_EN}</p>
              <p className="hidden text-[9px] font-bold uppercase tracking-[0.15em] text-sageDark md:block">{BRAND_SUBTITLE}</p>
            </div>
          </Link>

          <form onSubmit={handleSearch} className="hidden flex-grow max-w-xl md:flex min-w-0">
            <div className="relative w-full flex rounded-full bg-white/90 shadow-soft transition-shadow focus-within:shadow-hover">
              <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10" />
              <input value={query} onChange={e => setQuery(e.target.value)} type="text"
                placeholder={t('nav.search_placeholder')}
                className="w-full h-10 sm:h-11 pl-11 pr-4 rounded-full bg-transparent outline-none text-sm text-textMain placeholder-gray-400" />
              <button type="submit" className="h-10 sm:h-11 px-5 bg-gradient-to-r from-sageDark to-sageDeep text-white text-sm font-bold rounded-full transition-all mr-0.5 my-0.5 shadow-md hover:scale-[1.02]">
                {t('nav.search')}
              </button>
            </div>
          </form>

          <div className="hidden xl:flex items-center gap-5 text-sm font-semibold text-textMuted">
            <Link to="/" className="hover:text-textMain transition-colors">{t('nav.home')}</Link>
            <Link to="/products" className="hover:text-textMain transition-colors">{t('nav.products')}</Link>
            <Link to="/cart" className="hover:text-textMain transition-colors">{t('nav.cart')}</Link>
            <Link to="/favorites" className="hover:text-textMain transition-colors">{t('nav.favorites')}</Link>
            {user && <Link to="/profile" className="hover:text-textMain transition-colors">Profile</Link>}
            {isAdmin && <Link to="/dashboard" className="hover:text-textMain transition-colors">Dashboard</Link>}
            {isAdmin && <Link to="/pos" className="hover:text-textMain transition-colors">POS</Link>}
            {user ? (
              <button
                onClick={handleLogout}
                className="hover:text-textMain transition-colors"
              >
                {t('nav.logout')}
              </button>
            ) : (
              <Link to="/login" className="hover:text-textMain transition-colors">{t('nav.login')}</Link>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Language toggle — always accessible on all screen sizes */}
            <button
              onClick={() => setLang(lang === 'en' ? 'ta' : 'en')}
              title="Switch language / மொழி மாற்று"
              className="flex items-center rounded-full bg-[#F9FAFB] border border-sand/60 px-1 py-0.5 text-[10px] font-black text-[#111111] shrink-0 mr-0.5"
            >
              <span className={`px-1.5 py-0.5 rounded-full transition-colors ${lang === 'en' ? 'bg-[#111111] text-white' : 'text-[#374151]'}`}>EN</span>
              <span className={`px-1.5 py-0.5 rounded-full transition-colors ${lang === 'ta' ? 'bg-[#111111] text-white' : 'text-[#374151]'}`}>த</span>
            </button>
            <motion.button whileTap={{ scale: 0.88 }} onClick={() => setShowFav(true)} className="relative rounded-full hover:bg-sage/20 transition-colors touch-target">
              <Heart size={18} className="text-textMuted sm:size-[20px]" />
              {favCount > 0 && <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{favCount}</span>}
            </motion.button>
            <motion.button whileTap={{ scale: 0.88 }} onClick={() => setShowCart(true)} className="relative rounded-full hover:bg-sage/20 transition-colors touch-target">
              <ShoppingCart size={18} className="text-textMuted sm:size-[20px]" />
              {count > 0 && <span className="absolute -top-0.5 -right-0.5 bg-sageDark text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{count}</span>}
            </motion.button>
            <button onClick={() => setMobileOpen(!mobileOpen)} className="lg:hidden rounded-full hover:bg-sage/20 transition-colors ml-1 touch-target">
              {mobileOpen ? <X size={18} className="text-textMain sm:size-[20px]" /> : <Menu size={18} className="text-textMuted sm:size-[20px]" />}
            </button>
          </div>
        </nav>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="lg:hidden overflow-hidden border-t border-sand/50 bg-white px-4 py-4 flex flex-col gap-3">
              <form onSubmit={handleSearch} className="flex">
                <input value={query} onChange={e => setQuery(e.target.value)} type="text" placeholder={t('nav.search_placeholder')}
                  className="flex-grow h-10 px-3 rounded-l-lg border-2 border-sand focus:border-sage outline-none text-sm" />
                <button type="submit" className="h-10 px-4 bg-sageDark text-white text-sm font-bold rounded-r-lg">{t('nav.search')}</button>
              </form>
              <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                {[
                  [t('nav.home'), '/'],
                  [t('nav.products'), '/products'],
                  [t('nav.cart'), '/cart'],
                  [t('nav.favorites'), '/favorites'],
                  ...(user ? [['Profile', '/profile']] : []),
                  ...(isAdmin ? [['Dashboard', '/dashboard'], ['POS', '/pos']] : []),
                  ...(!user ? [[t('nav.login'), '/login']] : [])
                ].map(([label, href]) => (
                  <Link key={href} to={href} onClick={() => setMobileOpen(false)}
                    className="py-2.5 px-3 bg-bgMain rounded-lg text-sm font-semibold text-textMuted hover:text-textMain text-center transition-colors">
                    {label}
                  </Link>
                ))}
              </div>
              {user && (
                <button
                  onClick={async () => {
                    setMobileOpen(false)
                    await handleLogout()
                  }}
                  className="w-full py-2.5 px-3 bg-white border border-sand rounded-lg text-sm font-semibold text-red-500"
                >
                  {t('nav.logout')}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <CartDrawer open={showCart} onClose={() => setShowCart(false)} />
      <FavoritesDrawer open={showFav} onClose={() => setShowFav(false)} />
    </>
  )
}
