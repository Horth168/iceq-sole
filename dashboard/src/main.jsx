import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout, { AuthProvider } from './components/Layout'
import { ToastProvider } from './components/ui'
import Login from './pages/Login'
import Overview from './pages/Overview'
import Products from './pages/Products'
import ProductForm from './pages/ProductForm'
import Catalog from './pages/Catalog'
import { Invoice, OrderDetail, Orders } from './pages/Orders'
import Inventory from './pages/Inventory'
import { CustomerDetail, Customers } from './pages/Customers'
import Marketing, { Reviews } from './pages/Marketing'
import Settings from './pages/Settings'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<Layout />}>
              <Route index element={<Overview />} />
              <Route path="orders" element={<Orders />} />
              <Route path="orders/:id" element={<OrderDetail />} />
              <Route path="orders/:id/invoice" element={<Invoice />} />
              <Route path="products" element={<Products />} />
              <Route path="products/:id" element={<ProductForm />} />
              <Route path="catalog" element={<Catalog />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="customers" element={<Customers />} />
              <Route path="customers/:id" element={<CustomerDetail />} />
              <Route path="marketing" element={<Marketing />} />
              <Route path="reviews" element={<Reviews />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<p className="py-20 text-center text-stone-450">Page not found.</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
