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
        <Route path="/category/:id" component={CategoryPage} />
        <Route path="/suppliers" component={SuppliersPage} />
        <Route path="/supplier/:id" component={SupplierProfilePage} />
        <Route path="/product/:id" component={ProductDetailPage} />
        <Route path="/about" component={AboutPage} />
        <Route path="/contact" component={ContactPage} />
        <Route path="/terms" component={TermsPage} />
        <Route path="/search" component={SearchPage} />
        <Route path="/register" component={RegisterPage} />
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
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
