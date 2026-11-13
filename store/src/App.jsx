import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Shop from './pages/Shop'
import Product from './pages/Product'
import { NotFound } from './pages/Misc'

const Cart = lazy(() => import('./pages/Cart'))
const Checkout = lazy(() => import('./pages/Checkout'))
const Order = lazy(() => import('./pages/Order'))
const Track = lazy(() => import('./pages/Track'))
const Login = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Login })))
const Register = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Register })))
const AccountLayout = lazy(() => import('./pages/account/Account'))
const Profile = lazy(() => import('./pages/account/Account').then((m) => ({ default: m.Profile })))
const Orders = lazy(() => import('./pages/account/Account').then((m) => ({ default: m.Orders })))
const OrderDetail = lazy(() => import('./pages/account/Account').then((m) => ({ default: m.OrderDetail })))
const Addresses = lazy(() => import('./pages/account/Account').then((m) => ({ default: m.Addresses })))
const ChangePassword = lazy(() => import('./pages/account/Account').then((m) => ({ default: m.ChangePassword })))
const Wishlist = lazy(() => import('./pages/Misc').then((m) => ({ default: m.Wishlist })))
const Brands = lazy(() => import('./pages/Misc').then((m) => ({ default: m.Brands })))
const About = lazy(() => import('./pages/Misc').then((m) => ({ default: m.About })))

const Fallback = () => <div className="container-x py-10"><div className="skeleton h-[60vh]" /></div>

export default function App() {
  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="shop" element={<Shop key="shop" preset="shop" />} />
          <Route path="new-arrivals" element={<Shop key="new" preset="new" />} />
          <Route path="best-sellers" element={<Shop key="best" preset="best" />} />
          <Route path="sale" element={<Shop key="sale" preset="sale" />} />
          <Route path="brands" element={<Brands />} />
          <Route path="brands/:slug" element={<Shop key="brand" preset="brand" />} />
          <Route path="category/:slug" element={<Shop key="category" preset="category" />} />
          <Route path="product/:slug" element={<Product />} />
          <Route path="cart" element={<Cart />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="order/:number" element={<Order />} />
          <Route path="track" element={<Track />} />
          <Route path="wishlist" element={<Wishlist />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="about" element={<About />} />
          <Route path="account" element={<AccountLayout />}>
            <Route index element={<Profile />} />
            <Route path="orders" element={<Orders />} />
            <Route path="orders/:number" element={<OrderDetail />} />
            <Route path="addresses" element={<Addresses />} />
            <Route path="password" element={<ChangePassword />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
