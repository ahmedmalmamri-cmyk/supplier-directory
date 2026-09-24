import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

import Home from '@/pages/home';
import CategoryPage from '@/pages/category';
import CategoriesPage from '@/pages/categories';
import SuppliersPage from '@/pages/suppliers';
import SupplierProfilePage from '@/pages/supplier-profile';
import ProductDetailPage from '@/pages/product-detail';
import AboutPage from '@/pages/about';
import ContactPage from '@/pages/contact';
import TermsPage from '@/pages/terms';
import SearchPage from '@/pages/search';
import RegisterPage from '@/pages/register';
import ExpansionPage from '@/pages/expansion';
import AdminPage from '@/pages/admin';
import BuyerLoginPage from '@/pages/buyer-login';
import BuyerProfilePage from '@/pages/buyer-profile';
import SupplierLoginPage from '@/pages/supplier-login';
import SupplierPortalPage from '@/pages/supplier-portal';
import LoginChoicePage from '@/pages/login-choice';
import { BuyerAuthProvider } from '@/lib/buyer-auth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/categories" component={CategoriesPage} />
        <Route path="/category/:id" component={CategoryPage} />
        <Route path="/suppliers" component={SuppliersPage} />
        <Route path="/login" component={LoginChoicePage} />
         <Route path="/supplier/login" component={SupplierLoginPage} />
         <Route path="/supplier/portal" component={SupplierPortalPage} />
         <Route path="/supplier/:id" component={SupplierProfilePage} />
        <Route path="/product/:id" component={ProductDetailPage} />
        <Route path="/about" component={AboutPage} />
        <Route path="/contact" component={ContactPage} />
        <Route path="/terms" component={TermsPage} />
        <Route path="/search" component={SearchPage} />
         <Route path="/register/supplier" component={() => <RegisterPage defaultType="supplier" />} />
         <Route path="/register/buyer" component={() => <RegisterPage defaultType="buyer" />} />
         <Route path="/register" component={() => <RegisterPage />} />
         <Route path="/buyer/login" component={BuyerLoginPage} />
          <Route path="/buyer/profile" component={BuyerProfilePage} />
        <Route path="/expansion" component={ExpansionPage} />
        <Route path="/admin" component={AdminPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BuyerAuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </BuyerAuthProvider>
    </QueryClientProvider>
  );
}

export default App;
