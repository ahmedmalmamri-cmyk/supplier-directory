// ملف مؤقت لتجاوز مشكلة الاستيراد
export const useFetchCategory = () => ({ data: null, isLoading: false, error: null });
export const useFetchCategories = () => ({ data: [], isLoading: false, error: null });
export const useFetchSuppliers = () => ({ data: [], isLoading: false, error: null });
export const useFetchProduct = () => ({ data: null, isLoading: false, error: null });
export const useFetchProducts = () => ({ data: [], isLoading: false, error: null });
export const useFetchBuyerInquiries = () => ({ data: [], isLoading: false, error: null });
export const getListBuyerItemInquiriesQueryKey = () => ['buyer-inquiries'];
export const getListRequestsQueryKey = () => ['requests'];
export const getFetchCategoryQueryKey = () => ['category'];
export const useQueryClient = () => ({ removeQueries: () => {}, invalidateQueries: () => {} });
