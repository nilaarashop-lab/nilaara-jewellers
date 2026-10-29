import { BrowserRouter, Routes, Route } from "react-router-dom";
import { StoreProvider } from "./store/StoreContext";
import { AuthProvider } from "./store/AuthContext";
import { Header, Footer, CartDrawer } from "./components/Layout";
import { ScrollToTopOnNavigate, BackToTopButton } from "./components/ScrollToTop";
import Home from "./pages/Home";
import Shop from "./pages/Shop";
import Product from "./pages/Product";
import { Cart, Success, Wishlist, About, Contact, Track } from "./pages/Misc";
import Checkout from "./pages/Checkout";
import MyOrders from "./pages/Orders";
import Stores from "./pages/Stores";
import Admin from "./pages/Admin";
import { Login, Register } from "./pages/Auth";
import Account from "./pages/Account";

export default function App() {
  return (
    // Router outermost so the store (login dialog, cart navigation) can use
    // route context; auth sits above the store because the cart syncs per user.
    <BrowserRouter>
      <AuthProvider>
        <StoreProvider>
          <ScrollToTopOnNavigate />
          <Header />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/product/:id" element={<Product />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/success" element={<Success />} />
            <Route path="/orders" element={<MyOrders />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/stores" element={<Stores />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/account" element={<Account />} />
            <Route path="/track" element={<Track />} />
            <Route path="*" element={<Home />} />
          </Routes>
          <CartDrawer />
          <BackToTopButton />
          <Footer />
        </StoreProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
