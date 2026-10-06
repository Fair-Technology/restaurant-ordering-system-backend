// Entry point for Azure Functions v4
// This file imports all function definitions to register them with the runtime

// Shop endpoints
import './functions/shop/getAllShops/index';
import './functions/shop/getMyShops/index';
import './functions/shop/getShop/index';
import './functions/shop/getShopBySlug/index';
import './functions/shop/createShop/index';
import './functions/shop/updateShop/index';
import './functions/shop/deleteShop/index';
import './functions/shop/generateShopLogoUploadUrl/index';
import './functions/shop/setShopLogo/index';
import './functions/shop/generateShopCoverImageUploadUrl/index';
import './functions/shop/setShopCoverImage/index';
import './functions/shop/removeShopCoverImage/index';
import './functions/shop/requestShopNameChange/index';
import './functions/shop/approveShopNameChange/index';
import './functions/shop/rejectShopNameChange/index';
import './functions/shop/reactivateShop/index';
import './functions/shop/getGoLiveStatus/index';
import './functions/shop/createStripeAccountSession/index';
import './functions/shop/disconnectStripeAccount/index';
import './functions/shop/updateOrderSettings/index';

// Product endpoints
import './functions/product/getProductsByShop/index';
import './functions/product/getProduct/index';
import './functions/product/createProduct/index';
import './functions/product/updateProduct/index';
import './functions/product/deleteProduct/index';
import './functions/product/generateImageUploadUrl/index';
import './functions/product/addProductImage/index';

// Category endpoints
import './functions/category/getCategoriesByShop/index';
import './functions/category/getCatalog/index';
import './functions/category/getCategory/index';
import './functions/category/createCategory/index';
import './functions/category/updateCategory/index';
import './functions/category/deleteCategory/index';

// Order endpoints
import './functions/order/checkout/index';
import './functions/order/stripeWebhook/index';
import './functions/order/stripeConnectWebhook/index';
import './functions/order/getOrderByPaymentIntent/index';
import './functions/order/getOrdersByShop/index';
import './functions/order/quoteBasket/index';
import './functions/order/getOrderQueue/index';
import './functions/order/acceptOrder/index';
import './functions/order/rejectOrder/index';
import './functions/order/refundOrder/index';
import './functions/order/getOrderDocument/index';
import './functions/order/viewCustomerDocument/index';
import './functions/order/markOrderReady/index';
import './functions/order/completeOrder/index';
import './functions/order/viewCustomerOrder/index';
import './functions/order/cancelCustomerOrder/index';
import './functions/order/orderTimers/index';

// Audit endpoints
import './functions/audit/getAuditEntries/index';

// User endpoints
import './functions/user/getMe/index';

// Swagger endpoints
import './functions/swagger/swaggerJson/index';
import './functions/swagger/swaggerUi/index';

// Plan endpoints
import './functions/plan/getPlans/index';
import './functions/plan/getPlan/index';
import './functions/plan/createPlan/index';
import './functions/plan/updatePlan/index';
import './functions/plan/getPlanPricing/index';
import './functions/plan/setPlanPricing/index';

// Subscription endpoints
import './functions/subscription/getShopSubscription/index';
import './functions/subscription/overrideShopSubscription/index';
import './functions/subscription/createSubscriptionCheckout/index';
import './functions/subscription/cancelShopSubscription/index';
import './functions/subscription/resumeShopSubscription/index';

// Usage endpoints
import './functions/usage/getShopUsage/index';
import './functions/usage/reconcileShopUsage/index';

// System config endpoints
import './functions/systemConfig/getSystemConfig/index';
import './functions/systemConfig/updateSystemConfig/index';
import './functions/systemConfig/getRolePermissions/index';
import './functions/systemConfig/updateRolePermissions/index';

// Reference list endpoints (allergens, additives, tax classes/rates)
import './functions/reference/getReferenceLists/index';
import './functions/reference/updateReferenceLists/index';

// Legal endpoints
import './functions/legal/getPlatformLegalIdentity/index';
import './functions/legal/updatePlatformLegalIdentity/index';
import './functions/legal/getShopLegal/index';
import './functions/legal/updateShopLegal/index';
import './functions/legal/acceptDpa/index';
import './functions/legal/getPublicLegalPack/index';
import './functions/legal/getDpaDocument/index';
import './functions/legal/getPlatformLegal/index';
import './functions/legal/exportShopData/index';
import './functions/legal/eraseCustomer/index';

// User admin endpoints
import './functions/user/updateUserLimits/index';

// Staff endpoints
import './functions/staff/listStaff/index';
import './functions/staff/createStaff/index';
import './functions/staff/updateStaff/index';
import './functions/staff/resetStaffPassword/index';
import './functions/staff/deleteStaff/index';
import './functions/staff/staffLogin/index';
