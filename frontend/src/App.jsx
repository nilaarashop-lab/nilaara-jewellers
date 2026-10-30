import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { StoreProvider } from "./store/StoreContext";
import { Header, Footer } from "./components/Layout";
import { ScrollToTopOnNavigate, BackToTopButton } from "./components/ScrollToTop";
import Home from "./pages/Home";
import Shop from "./pages/Shop";
import Product from "./pages/Product";
import { Wishlist, About, Contact } from "./pages/Misc";
import Stores from "./pages/Stores";
import Admin from "./pages/Admin";

export default function App() {
  return (
    // Router outermost so the store and header can use route context. The
    // storefront is a static catalogue with WhatsApp ordering; staff edit the
    // catalogue and homepage at /admin through the GitHub-backed admin.
    <BrowserRouter>
      <StoreProvider>
        <ScrollToTopOnNavigate />
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/product/:id" element={<Product />} />
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/stores" element={<Stores />} />
          <Route path="/admin" element={<Admin />} />
          {/* Retired storefront routes — old links land somewhere useful. */}
          <Route path="/cart" element={<Navigate to="/shop" replace />} />
          <Route path="/checkout" element={<Navigate to="/shop" replace />} />
          <Route path="/success" element={<Navigate to="/shop" replace />} />
          <Route path="/orders" element={<Navigate to="/shop" replace />} />
          <Route path="/track" element={<Navigate to="/shop" replace />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/register" element={<Navigate to="/" replace />} />
          <Route path="/account" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Home />} />
        </Routes>
        <BackToTopButton />
        <Footer />
      </StoreProvider>
    </BrowserRouter>
  );
}
