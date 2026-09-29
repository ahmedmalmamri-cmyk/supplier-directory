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
import CategoriesPage from '@/pages/categories';
import CategoryPage from '@/pages/category';
import ItemCategoryPage from '@/pages/item-category';
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
import SupplierInvitePage from '@/pages/supplier-invite';
import SupplierActivatePage from '@/pages/supplier-activate';
import BuyerInvitePage from '@/pages/buyer-invite';
import BuyerLoginPage from '@/pages/buyer-login';
import BuyerProfilePage from '@/pages/buyer-profile';
import TestModePage from '@/pages/test-mode';
import SupplierLoginPage from '@/pages/supplier-login';
import SupplierPortalPage from '@/pages/supplier-portal';
import SupplierDashboardPage from '@/pages/supplier-dashboard';
import SupplierMarketPage from '@/pages/supplier-market';
import SupplierAlmondVariantsPage from '@/pages/supplier-almond-variants';
import LoginChoicePage from '@/pages/login-choice';
import RequestsPage from '@/pages/requests';
import NewRequestPage from '@/pages/request-new';
import NewInquiryPage from '@/pages/inquiry-new';
import InquiriesPage from '@/pages/inquiries';
import SupplierInquiriesPage from '@/pages/supplier-inquiries';
import { BuyerAuthProvider } from '@/lib/buyer-auth';
import { SupplierAuthProvider } from '@/lib/supplier-auth';

function shouldRetryQuery(failureCount: number, error: unknown) {
  if (failureCount >= 2) return false;
  if (error instanceof TypeError) return true;
  if (!(error instanceof Error)) return false;

  const responseError = error as Error & {
    status?: number;
    headers?: { get?: (name: string) => string | null };
  };
  const status = responseError.status;
  if (status === 408 || status === 429 || (status !== undefined && status >= 500)) return true;
  if (status !== 404) return false;

  // The workspace proxy can briefly return an HTML 404 while the API starts.
  return responseError.headers?.get?.('content-type')?.toLowerCase().includes('text/html') ?? false;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      retry: shouldRetryQuery,
      retryDelay: (failureCount) => Math.min(1000 * 2 ** failureCount, 5000),
    },
  },
});

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/categories/all" component={CategoriesPage} />
        <Route path="/category/:slug/:subslug/:itemslug" component={ItemCategoryPage} />
        <Route path="/category/:slug/:subslug" component={ItemCategoryPage} />
        <Route path="/category/:value">
          {(params) => /^\d+$/.test(params.value) ? <CategoryPage /> : <ItemCategoryPage />}
        </Route>
        <Route path="/suppliers" component={SuppliersPage} />
        <Route path="/login" component={() => <LoginChoicePage />} />
          <Route path="/supplier/activate" component={SupplierActivatePage} />
          <Route path="/supplier/login" component={SupplierLoginPage} />
          <Route path="/supplier/dashboard" component={SupplierDashboardPage} />
          <Route path="/supplier/market" component={SupplierMarketPage} />
          <Route path="/supplier/almond-variants" component={SupplierAlmondVariantsPage} />
           <Route path="/supplier/inquiries" component={SupplierInquiriesPage} />
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
         <Route path="/requests/new" component={NewRequestPage} />
         <Route path="/requests" component={RequestsPage} />
          <Route path="/inquiries/new" component={NewInquiryPage} />
          <Route path="/inquiries" component={InquiriesPage} />
        <Route path="/test-mode" component={() => <TestModePage />} />
        <Route path="/test-mode/report" component={() => <TestModePage view="report" />} />
        <Route path="/expansion" component={ExpansionPage} />
        <Route path="/admin/categories" component={() => <AdminPage initialTab="item-categories" />} />
        <Route path="/admin" component={() => <AdminPage />} />
         <Route path="/invite/buyer/:token" component={BuyerInvitePage} />
         <Route path="/invite/:token" component={SupplierInvitePage} />
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
        <SupplierAuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
        </SupplierAuthProvider>
      </BuyerAuthProvider>
    </QueryClientProvider>
  );
}

export default App;
