// Global storefront state: public settings, auth session, persistent cart and wishlist.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, cartToken, onAuthChange, tokens } from '../lib/api'
import { store } from '../lib/storage'
import { useToast } from './Toast'

const Ctx = createContext(null)
export const useStore = () => useContext(Ctx)

export function StoreProvider({ children }) {
  const toast = useToast()
  const [settings, setSettings] = useState(null)
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [cart, setCart] = useState(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [wishIds, setWishIds] = useState(() => store.json('iq_wish', []))

  // ---------- settings
  useEffect(() => {
    api('/api/settings/public', { auth: false }).then(setSettings).catch(() => setSettings({}))
  }, [])

  // ---------- cart
  const applyCart = useCallback((c) => {
    if (!c) return c
    cartToken.set(c.token)
    setCart(c)
    return c
  }, [])
  const refreshCart = useCallback(() => api('/api/cart').then(applyCart).catch(() => null), [applyCart])

  // ---------- auth
  const loadUser = useCallback(async () => {
    if (!tokens.access && !tokens.refresh) {
      setUser(null)
      setAuthReady(true)
      return null
    }
    try {
      const me = await api('/api/account/me')
      setUser(me)
      return me
    } catch {
      setUser(null)
      return null
    } finally {
      setAuthReady(true)
    }
  }, [])

  useEffect(() => {
    loadUser().then(refreshCart)
    return onAuthChange(() => setUser(null))
  }, [loadUser, refreshCart])

  const syncWishlist = useCallback(async () => {
    const local = store.json('iq_wish', [])
    try {
      const items = await api('/api/account/wishlist-sync', { method: 'POST', body: local })
      const ids = items.map((p) => p.id)
      setWishIds(ids)
      store.setJson('iq_wish', ids)
    } catch { /* ignore */ }
  }, [])

  const afterAuth = useCallback(async (data) => {
    tokens.set(data)
    setUser(data.user)
    await Promise.all([refreshCart(), syncWishlist()])
    return data.user
  }, [refreshCart, syncWishlist])

  const login = (email, password) => api('/api/auth/login', { method: 'POST', body: { email, password } }).then(afterAuth)
  const register = (body) => api('/api/auth/register', { method: 'POST', body }).then(afterAuth)
  const logout = async () => {
    const rt = tokens.refresh
    tokens.clear()
    setUser(null)
    store.remove('iq_cart')
    setCart(null)
    if (rt) api('/api/auth/logout', { method: 'POST', body: { refresh_token: rt }, auth: false }).catch(() => {})
    refreshCart()
    toast.info('You are signed out')
  }

  useEffect(() => { if (user) syncWishlist() }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- cart actions
  const addToCart = async (variant_id, quantity = 1, { silent } = {}) => {
    const c = applyCart(await api('/api/cart/items', { method: 'POST', body: { variant_id, quantity } }))
    if (!silent) setCartOpen(true)
    return c
  }
  const updateQty = async (itemId, quantity) =>
    applyCart(await api(`/api/cart/items/${itemId}`, { method: 'PATCH', body: { quantity } }))
  const changeVariant = async (itemId, variant_id, quantity) =>
    applyCart(await api(`/api/cart/items/${itemId}/variant`, { method: 'PUT', body: { variant_id, quantity } }))
  const removeItem = async (itemId) => applyCart(await api(`/api/cart/items/${itemId}`, { method: 'DELETE' }))
  const applyDiscount = async (code) => applyCart(await api('/api/cart/discount', { method: 'POST', body: { code } }))
  const removeDiscount = async () => applyCart(await api('/api/cart/discount', { method: 'DELETE' }))

  // ---------- wishlist (local for guests, server for members)
  const toggleWish = async (product) => {
    const has = wishIds.includes(product.id)
    const next = has ? wishIds.filter((x) => x !== product.id) : [product.id, ...wishIds]
    setWishIds(next)
    store.setJson('iq_wish', next)
    if (user) {
      try {
        await api(`/api/account/wishlist/${product.id}`, { method: has ? 'DELETE' : 'POST' })
      } catch (e) {
        toast.error(e.message)
      }
    }
    toast.success(has ? 'Removed from wishlist' : `Saved ${product.name} to your wishlist`)
  }

  const value = useMemo(() => ({
    settings, user, setUser, authReady, login, register, logout, loadUser,
    cart, cartOpen, setCartOpen, refreshCart, addToCart, updateQty, changeVariant, removeItem, applyDiscount,
    removeDiscount, setCart: applyCart,
    wishIds, toggleWish, isWished: (id) => wishIds.includes(id),
  }), [settings, user, authReady, cart, cartOpen, wishIds]) // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
