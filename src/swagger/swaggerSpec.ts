export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Online Ordering System API',
    version: '1.0.0',
    description:
      'REST API for managing shops and products in an online ordering system',
  },
  servers: [
    {
      url: '/api',
      description: 'API base',
    },
  ],
  security: [{ bearerAuth: [] }],
  paths: {
    '/shops': {
      get: {
        summary: 'Get all shops',
        operationId: 'getShops',
        tags: ['Shops'],
        responses: {
          '200': {
            description: 'List of all shops retrieved successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GetAllShopsResponse' },
              },
            },
          },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
      post: {
        summary: 'Create a new shop',
        operationId: 'createShop',
        tags: ['Shops'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateShopRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Shop created successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ShopResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/shops/slug/{slug}': {
      get: {
        summary: 'Get shop by slug',
        operationId: 'getShopBySlug',
        tags: ['Shops'],
        security: [],
        parameters: [
          {
            name: 'slug',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Shop slug (public identifier)',
          },
        ],
        responses: {
          '200': {
            description: 'Shop retrieved successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ShopResponse' },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/shops/me': {
      get: {
        summary: "Get the authenticated user's shops",
        operationId: 'getMyShops',
        tags: ['Shops'],
        responses: {
          '200': {
            description: 'Shops where the user is an active owner member',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GetAllShopsResponse' },
              },
            },
          },
          '403': { $ref: '#/components/responses/Forbidden' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/shops/{shopId}': {
      get: {
        summary: 'Get shop by ID',
        operationId: 'getShopById',
        tags: ['Shops'],
        parameters: [
          {
            name: 'shopId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Shop ID',
          },
        ],
        responses: {
          '200': {
            description: 'Shop retrieved successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ShopResponse' },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
      patch: {
        summary: 'Update shop',
        operationId: 'updateShop',
        tags: ['Shops'],
        parameters: [
          {
            name: 'shopId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Shop ID',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateShopRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Shop updated successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ShopResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
      delete: {
        summary: 'Delete shop (soft delete)',
        operationId: 'deleteShop',
        tags: ['Shops'],
        parameters: [
          {
            name: 'shopId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Shop ID',
          },
        ],
        responses: {
          '200': {
            description: 'Shop deleted successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeleteResponse' },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/shops/{shopId}/categories': {
      get: {
        summary: 'Get categories by shop',
        operationId: 'getCategoriesByShop',
        tags: ['Categories'],
        parameters: [
          {
            name: 'shopId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Shop ID',
          },
        ],
        responses: {
          '200': {
            description: 'Categories retrieved successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CategoriesResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
      post: {
        summary: 'Create a new category',
        operationId: 'createCategory',
        tags: ['Categories'],
        parameters: [
          {
            name: 'shopId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Shop ID',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateCategoryRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Category created successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CategoryResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/shops/{shopId}/categories/{categoryId}': {
      get: {
        summary: 'Get category by ID',
        operationId: 'getCategoryById',
        tags: ['Categories'],
        parameters: [
          {
            name: 'shopId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Shop ID',
          },
          {
            name: 'categoryId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Category ID',
          },
        ],
        responses: {
          '200': {
            description: 'Category retrieved successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CategoryResponse' },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
      patch: {
        summary: 'Update category',
        operationId: 'updateCategory',
        tags: ['Categories'],
        parameters: [
          {
            name: 'shopId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Shop ID',
          },
          {
            name: 'categoryId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Category ID',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateCategoryRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Category updated successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CategoryResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
      delete: {
        summary: 'Delete category (soft delete)',
        operationId: 'deleteCategory',
        tags: ['Categories'],
        parameters: [
          {
            name: 'shopId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Shop ID',
          },
          {
            name: 'categoryId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Category ID',
          },
        ],
        responses: {
          '200': {
            description: 'Category deleted successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CategoryResponse' },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/products': {
      get: {
        summary: 'Get products by shop',
        operationId: 'getProductsByShop',
        tags: ['Products'],
        security: [],
        parameters: [
          {
            name: 'shopId',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Shop ID to filter products',
          },
        ],
        responses: {
          '200': {
            description: 'Products retrieved successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProductsResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
      post: {
        summary: 'Create a new product',
        operationId: 'createProduct',
        tags: ['Products'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateProductRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Product created successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProductResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/products/{productId}': {
      get: {
        summary: 'Get product by ID',
        operationId: 'getProductById',
        tags: ['Products'],
        parameters: [
          {
            name: 'productId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Product ID',
          },
          {
            name: 'shopId',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Shop ID (required for partition key)',
          },
        ],
        responses: {
          '200': {
            description: 'Product retrieved successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProductResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
      patch: {
        summary: 'Update product',
        operationId: 'updateProduct',
        tags: ['Products'],
        parameters: [
          {
            name: 'productId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Product ID',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateProductRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Product updated successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProductResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
      delete: {
        summary: 'Delete product (soft delete)',
        operationId: 'deleteProduct',
        tags: ['Products'],
        parameters: [
          {
            name: 'productId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Product ID',
          },
          {
            name: 'shopId',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Shop ID (required for partition key)',
          },
        ],
        responses: {
          '200': {
            description: 'Product deleted successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeleteResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/shops/{shopId}/products/{productId}/images/upload-url': {
      post: {
        summary: 'Generate upload URL for product image',
        operationId: 'generateUploadUrl',
        description:
          'Generates a short-lived SAS URL for uploading product images directly to Azure Blob Storage',
        tags: ['Product Images'],
        parameters: [
          {
            name: 'shopId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Shop ID',
          },
          {
            name: 'productId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Product ID',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/GenerateImageUploadUrlRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Upload URL generated successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/GenerateImageUploadUrlResponse',
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/shops/{shopId}/products/{productId}/images': {
      post: {
        summary: 'Add product image metadata',
        operationId: 'addProductImage',
        description:
          'Confirms image upload and saves metadata to the product after successful blob storage upload',
        tags: ['Product Images'],
        parameters: [
          {
            name: 'shopId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Shop ID',
          },
          {
            name: 'productId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Product ID',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AddProductImageRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Product image added successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProductImageResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/shops/{shopId}/logo/upload-url': {
      post: {
        summary: 'Generate upload URL for shop logo',
        operationId: 'generateShopLogoUploadUrl',
        description:
          'Generates a short-lived SAS URL for uploading the shop logo directly to Azure Blob Storage',
        tags: ['Shop Logo'],
        parameters: [
          {
            name: 'shopId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Shop ID',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GenerateShopLogoUploadUrlRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Upload URL generated successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GenerateShopLogoUploadUrlResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/shops/{shopId}/logo': {
      post: {
        summary: 'Set shop logo',
        operationId: 'setShopLogo',
        description:
          'Registers the uploaded logo blob URL on the shop. Deletes the previous logo blob if one existed.',
        tags: ['Shop Logo'],
        parameters: [
          {
            name: 'shopId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Shop ID',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SetShopLogoRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Shop logo updated successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ShopResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/shops/{shopId}/catalog': {
      get: {
        summary: 'Get customer-facing catalog for a shop',
        operationId: 'getCatalog',
        description:
          'Returns categories with their currently purchasable products. Products are filtered by isAvailable and the product schedule evaluated against the shop timezone. No authentication required. Returns 403 if the shop is currently paused.',
        tags: ['Catalog'],
        security: [],
        parameters: [
          {
            name: 'shopId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Shop ID',
          },
        ],
        responses: {
          '200': {
            description: 'Catalog retrieved successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CatalogResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/orders': {
      post: {
        summary: 'Create an order and initiate payment',
        operationId: 'createOrder',
        tags: ['Orders'],
        description:
          'Server recalculates the total from product prices, selected variants, and addons stored in the database. The client-submitted amount is never trusted. Returns a Stripe clientSecret for the frontend to call stripe.confirmPayment().',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CheckoutRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Order created and PaymentIntent initiated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CheckoutResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/webhooks/stripe': {
      post: {
        summary: 'Stripe webhook receiver',
        operationId: 'stripeWebhook',
        tags: ['Orders'],
        description:
          'Receives Stripe events (payment_intent.succeeded, payment_intent.payment_failed) and updates the order status. Signature is verified using STRIPE_WEBHOOK_SECRET.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Event received',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    received: { type: 'boolean', example: true },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/shops/{shopId}/orders': {
      get: {
        summary: 'List orders for a shop',
        operationId: 'getOrdersByShop',
        tags: ['Orders'],
        parameters: [
          {
            name: 'shopId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Shop ID',
          },
          {
            name: 'page',
            in: 'query',
            required: false,
            schema: { type: 'integer' },
            description: '1-based page number (default: 1)',
          },
          {
            name: 'pageSize',
            in: 'query',
            required: false,
            schema: { type: 'integer' },
            description: 'Number of orders per page (default: 20, max: 100)',
          },
        ],
        responses: {
          '200': {
            description: 'Orders retrieved successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/OrdersPageResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/orders/by-payment-intent/{paymentIntentId}': {
      get: {
        summary: 'Get order by Stripe payment intent ID',
        operationId: 'getOrderByPaymentIntent',
        tags: ['Orders'],
        description:
          'Retrieves order details using the Stripe payment intent ID. The payment intent ID is available on the frontend from stripe.confirmPayment() result or by parsing the clientSecret (format: pi_xxx_secret_xxx). Returns 404 if the order has not yet been created (webhook not yet processed) — poll with back-off until a 200 is returned.',
        security: [],
        parameters: [
          {
            name: 'paymentIntentId',
            in: 'path',
            required: true,
            schema: { type: 'string', example: 'pi_3xxx' },
            description: 'Stripe PaymentIntent ID (starts with pi_)',
          },
        ],
        responses: {
          '200': {
            description: 'Order found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/OrderByPaymentIntentResponse' },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
  },
  components: {
    schemas: {
      OpeningTimeSlot: {
        type: 'object',
        properties: {
          open: { type: 'string', format: 'time', pattern: '^([01]?[0-9]|2[0-3]):[0-5][0-9]$', description: 'Opening time (HH:mm, 24-hour)', example: '09:00' },
          close: { type: 'string', format: 'time', pattern: '^([01]?[0-9]|2[0-3]):[0-5][0-9]$', description: 'Closing time (HH:mm, 24-hour)', example: '17:00' },
        },
      },
      Address: {
        type: 'object',
        properties: {
          street: { type: 'string', description: 'Street address', example: '123 Main Street' },
          city: { type: 'string', description: 'City', example: 'Belconnen' },
          state: { type: 'string', description: 'State or territory', example: 'ACT' },
          postcode: { type: 'string', description: 'Postal code', example: '2617' },
          country: { type: 'string', description: 'Country', example: 'Australia' },
        },
      },
      ShopClosure: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          start: { type: 'string', format: 'date-time' },
          end: { type: 'string', format: 'date-time' },
          reason: { type: 'string' },
        },
      },
      ShopMember: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          role: { type: 'string', enum: ['owner', 'staff'] },
          isActive: { type: 'boolean' },
        },
      },
      ProductImageRef: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Image ID' },
          url: { type: 'string', description: 'Image URL' },
          isPrimary: { type: 'boolean', description: 'Whether this is the primary image' },
        },
      },
      SpecialInfoItem: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Label text' },
          icon: { type: 'string', description: 'Lucide icon name' },
        },
      },
      VariantOption: {
        type: 'object',
        required: ['id', 'name', 'priceDelta', 'isAvailable'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Option ID' },
          name: { type: 'string', description: 'Option name', example: 'Large' },
          priceDelta: { type: 'integer', description: 'Price delta in cents', example: 200 },
          isAvailable: { type: 'boolean', description: 'Whether option is available', example: true },
        },
      },
      VariantGroup: {
        type: 'object',
        required: ['id', 'name', 'options'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Variant group ID' },
          name: { type: 'string', description: 'Variant group name', example: 'Size' },
          options: { type: 'array', items: { $ref: '#/components/schemas/VariantOption' } },
        },
      },
      AddonOption: {
        type: 'object',
        required: ['id', 'name', 'priceDelta', 'isAvailable'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Option ID' },
          name: { type: 'string', description: 'Option name', example: 'Extra cheese' },
          priceDelta: { type: 'integer', description: 'Price delta in cents', example: 150 },
          isAvailable: { type: 'boolean', description: 'Whether option is available', example: true },
        },
      },
      AddonGroup: {
        type: 'object',
        required: ['id', 'name', 'minSelectable', 'maxSelectable', 'options'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Addon group ID' },
          name: { type: 'string', description: 'Addon group name', example: 'Extras' },
          minSelectable: { type: 'integer', description: 'Minimum selectable options', example: 0 },
          maxSelectable: { type: 'integer', description: 'Maximum selectable options', example: 3 },
          options: { type: 'array', items: { $ref: '#/components/schemas/AddonOption' } },
        },
      },
      ProductCategory: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Category ID' },
          name: { type: 'string', description: 'Category name' },
          sortOrder: { type: 'number', description: 'Category sort order' },
          icon: { type: 'string', description: 'Lucide icon name' },
        },
      },
      CatalogImageRef: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          url: { type: 'string' },
          alt: { type: 'string', nullable: true },
          sortOrder: { type: 'integer' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string' },
        },
      },
      ShopBranding: {
        type: 'object',
        nullable: true,
        required: ['colors'],
        properties: {
          logoUrl: {
            type: 'string',
            nullable: true,
            description: 'Logo URL (must start with https://)',
            example: 'https://cdn.example.com/logo.png',
          },
          heroImageUrl: {
            type: 'string',
            nullable: true,
            description: 'Hero image URL (must start with https://)',
            example: 'https://cdn.example.com/hero.jpg',
          },
          colors: {
            type: 'object',
            required: ['primary', 'secondary', 'tertiary', 'background'],
            properties: {
              primary: {
                type: 'string',
                pattern: '^#[0-9A-Fa-f]{6}$',
                description: 'Primary brand color (hex)',
                example: '#1D4ED8',
              },
              secondary: {
                type: 'string',
                pattern: '^#[0-9A-Fa-f]{6}$',
                description: 'Secondary brand color (hex)',
                example: '#9333EA',
              },
              tertiary: {
                type: 'string',
                pattern: '^#[0-9A-Fa-f]{6}$',
                description: 'Tertiary brand color (hex)',
                example: '#F59E0B',
              },
              background: {
                type: 'string',
                pattern: '^#[0-9A-Fa-f]{6}$',
                description: 'Background color (hex)',
                example: '#F9FAFB',
              },
            },
          },
        },
      },
      GetAllShopsResponse: {
        type: 'object',
        properties: {
          shops: {
            type: 'array',
            items: { $ref: '#/components/schemas/ShopResponse' },
            description: 'Array of shops',
          },
          total: {
            type: 'integer',
            description: 'Total number of shops',
          },
        },
        required: ['shops', 'total'],
      },
      CreateShopRequest: {
        type: 'object',
        description:
          'Create a new shop. The following fields are automatically set: isDeleted=false, isPaused=false. The slug is auto-generated from the shop name. At least one day must have opening hours. If a shop with the same name already exists, an error will be returned.',
        required: [
          'name',
          'currency',
          'timezone',
          'minOrderAmountCents',
          'paymentPolicy',
          'address',
          'openingHours',
        ],
        properties: {
          name: {
            type: 'string',
            description: 'Shop name (slug will be auto-generated from this)',
            example: 'Burger King Belconnen',
          },
          currency: {
            type: 'string',
            example: 'AUD',
            description: 'Shop currency (ISO code)',
          },
          timezone: {
            type: 'string',
            example: 'Australia/Sydney',
            description: 'Shop timezone',
          },
          minOrderAmountCents: {
            type: 'number',
            description: 'Minimum order amount in cents',
            example: 1500,
          },
          paymentPolicy: {
            type: 'string',
            enum: ['pay_online'],
            description: 'Payment policy',
          },
          address: { $ref: '#/components/schemas/Address' },
          pausedMessage: {
            type: 'string',
            description: 'Message when shop is paused (optional)',
          },
          orderAcceptanceMode: {
            type: 'string',
            enum: ['auto'],
            description: 'Order acceptance mode (optional, defaults to auto)',
          },
          openingHours: {
            type: 'object',
            description:
              'Shop opening hours for each day of the week. At least one day must have opening hours.',
            example: {
              mon: [{ open: '09:00', close: '17:00' }],
              tue: [{ open: '09:00', close: '17:00' }],
              wed: [],
              thu: [{ open: '09:00', close: '17:00' }],
              fri: [{ open: '09:00', close: '22:00' }],
              sat: [{ open: '10:00', close: '16:00' }],
              sun: [{ open: '11:00', close: '15:00' }],
            },
            properties: {
              mon: { type: 'array', description: 'Monday opening hours', items: { $ref: '#/components/schemas/OpeningTimeSlot' } },
              tue: { type: 'array', description: 'Tuesday opening hours', items: { $ref: '#/components/schemas/OpeningTimeSlot' } },
              wed: { type: 'array', description: 'Wednesday opening hours', items: { $ref: '#/components/schemas/OpeningTimeSlot' } },
              thu: { type: 'array', description: 'Thursday opening hours', items: { $ref: '#/components/schemas/OpeningTimeSlot' } },
              fri: { type: 'array', description: 'Friday opening hours', items: { $ref: '#/components/schemas/OpeningTimeSlot' } },
              sat: { type: 'array', description: 'Saturday opening hours', items: { $ref: '#/components/schemas/OpeningTimeSlot' } },
              sun: { type: 'array', description: 'Sunday opening hours', items: { $ref: '#/components/schemas/OpeningTimeSlot' } },
            },
          },
          closures: {
            type: 'array',
            items: { $ref: '#/components/schemas/ShopClosure' },
          },
          members: {
            type: 'array',
            items: { $ref: '#/components/schemas/ShopMember' },
          },
          branding: {
            nullable: true,
            description: 'Shop branding configuration (optional). Set to null to disable branding.',
            $ref: '#/components/schemas/ShopBranding',
          },
        },
      },
      UpdateShopRequest: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Shop name' },
          isPaused: { type: 'boolean', description: 'Whether shop is paused' },
          pausedMessage: {
            type: 'string',
            description: 'Message when shop is paused',
          },
          paymentPolicy: {
            type: 'string',
            enum: ['pay_online'],
            description: 'Payment policy',
          },
          currency: { type: 'string', description: 'Shop currency' },
          timezone: { type: 'string', description: 'Shop timezone' },
          minOrderAmountCents: {
            type: 'number',
            description: 'Minimum order amount in cents',
          },
          address: { $ref: '#/components/schemas/Address' },
          branding: {
            nullable: true,
            description: 'Shop branding configuration. Set to null to clear branding.',
            $ref: '#/components/schemas/ShopBranding',
          },
          openingHours: {
            type: 'object',
            description: 'Shop opening hours per day. At least one day must have opening hours.',
            properties: {
              mon: { type: 'array', items: { $ref: '#/components/schemas/OpeningTimeSlot' } },
              tue: { type: 'array', items: { $ref: '#/components/schemas/OpeningTimeSlot' } },
              wed: { type: 'array', items: { $ref: '#/components/schemas/OpeningTimeSlot' } },
              thu: { type: 'array', items: { $ref: '#/components/schemas/OpeningTimeSlot' } },
              fri: { type: 'array', items: { $ref: '#/components/schemas/OpeningTimeSlot' } },
              sat: { type: 'array', items: { $ref: '#/components/schemas/OpeningTimeSlot' } },
              sun: { type: 'array', items: { $ref: '#/components/schemas/OpeningTimeSlot' } },
            },
          },
        },
      },
      ShopResponse: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Shop ID' },
          slug: { type: 'string', description: 'Shop slug' },
          name: { type: 'string', description: 'Shop name' },
          isDeleted: {
            type: 'boolean',
            description: 'Whether shop is deleted',
          },
          isPaused: {
            type: 'boolean',
            description: 'Whether shop is paused',
          },
          pausedMessage: {
            type: 'string',
            description: 'Message shown when shop is paused',
          },
          currency: {
            type: 'string',
            description: 'Shop currency (ISO code)',
          },
          timezone: {
            type: 'string',
            description: 'Shop timezone',
          },
          minOrderAmountCents: {
            type: 'number',
            description: 'Minimum order amount in cents',
          },
          address: { $ref: '#/components/schemas/Address' },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Creation timestamp',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Last update timestamp',
          },
          branding: {
            nullable: true,
            description: 'Shop branding configuration, or null if not configured.',
            $ref: '#/components/schemas/ShopBranding',
          },
          openingHours: {
            type: 'object',
            description: 'Shop opening hours per day of the week.',
            properties: {
              mon: { type: 'array', items: { $ref: '#/components/schemas/OpeningTimeSlot' } },
              tue: { type: 'array', items: { $ref: '#/components/schemas/OpeningTimeSlot' } },
              wed: { type: 'array', items: { $ref: '#/components/schemas/OpeningTimeSlot' } },
              thu: { type: 'array', items: { $ref: '#/components/schemas/OpeningTimeSlot' } },
              fri: { type: 'array', items: { $ref: '#/components/schemas/OpeningTimeSlot' } },
              sat: { type: 'array', items: { $ref: '#/components/schemas/OpeningTimeSlot' } },
              sun: { type: 'array', items: { $ref: '#/components/schemas/OpeningTimeSlot' } },
            },
          },
        },
      },
      CreateCategoryRequest: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Category name' },
          sortOrder: { type: 'number', description: 'Sort order for display' },
          icon: { type: 'string', description: 'Lucide icon name' },
        },
      },
      UpdateCategoryRequest: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Category name' },
          sortOrder: { type: 'number', description: 'Sort order for display' },
          icon: { type: 'string', description: 'Lucide icon name' },
        },
      },
      CategoryResponse: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Category ID' },
          shopId: { type: 'string', description: 'Shop ID' },
          name: { type: 'string', description: 'Category name' },
          sortOrder: { type: 'number', description: 'Sort order for display' },
          icon: { type: 'string', description: 'Lucide icon name' },
          isDeleted: {
            type: 'boolean',
            description: 'Whether category is deleted',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Creation timestamp',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Last update timestamp',
          },
        },
      },
      CategoriesResponse: {
        type: 'array',
        items: { $ref: '#/components/schemas/CategoryResponse' },
      },
      ProductSchedule: {
        type: 'object',
        required: ['startDate'],
        properties: {
          startDate: {
            type: 'string',
            description: 'Inclusive start date (YYYY-MM-DD)',
            example: '2026-03-18',
          },
          endDate: {
            type: 'string',
            nullable: true,
            description: 'Inclusive end date (YYYY-MM-DD); null = run indefinitely',
            example: '2026-03-20',
          },
          startTime: {
            type: 'string',
            nullable: true,
            description: 'Daily window open (HH:mm, 24-hour); absent = 00:00 (all day)',
            example: '12:00',
          },
          endTime: {
            type: 'string',
            nullable: true,
            description: 'Daily window close (HH:mm, 24-hour); absent = 23:59 (all day)',
            example: '16:00',
          },
          daysOfWeek: {
            type: 'array',
            items: { type: 'integer', minimum: 0, maximum: 6 },
            description: '0=Sun 1=Mon … 6=Sat; absent/empty = every day',
            example: [2, 3],
          },
          offerPrice: {
            type: 'integer',
            nullable: true,
            description: 'Optional discounted price in cents during this window; must be less than the product base price',
            example: 799,
          },
          offerLabel: {
            type: 'string',
            nullable: true,
            maxLength: 50,
            description: 'Optional label shown during the offer window (e.g. "Happy Hour")',
            example: 'Happy Hour',
          },
        },
      },
      CreateProductRequest: {
        type: 'object',
        required: ['shopId', 'name', 'description', 'price'],
        properties: {
          shopId: {
            type: 'string',
            description: 'Shop ID that owns this product',
          },
          name: { type: 'string', description: 'Product name' },
          description: { type: 'string', description: 'Product description' },
          price: { type: 'number', description: 'Product price in cents' },
          categoryIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Category IDs',
          },
          images: {
            type: 'array',
            items: { $ref: '#/components/schemas/ProductImageRef' },
          },
          specialInfo: {
            type: 'array',
            items: { $ref: '#/components/schemas/SpecialInfoItem' },
            description: 'Special info items (dietary labels, badges, etc.)',
          },
          isAvailable: {
            type: 'boolean',
            description: 'Whether product is available',
          },
          schedule: {
            nullable: true,
            allOf: [{ $ref: '#/components/schemas/ProductSchedule' }],
            description: 'Optional availability schedule; null = no time restriction',
          },
        },
      },
      UpdateProductRequest: {
        type: 'object',
        properties: {
          shopId: {
            type: 'string',
            description: 'Shop ID (required for partition key)',
          },
          name: { type: 'string', description: 'Product name' },
          description: { type: 'string', description: 'Product description' },
          price: { type: 'number', description: 'Product price in cents' },
          categoryIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Category IDs',
          },
          images: {
            type: 'array',
            items: { $ref: '#/components/schemas/ProductImageRef' },
          },
          specialInfo: {
            type: 'array',
            items: { $ref: '#/components/schemas/SpecialInfoItem' },
            description: 'Special info items (dietary labels, badges, etc.)',
          },
          isAvailable: {
            type: 'boolean',
            description: 'Whether product is available',
          },
          variantGroups: {
            type: 'array',
            description: 'Variant groups (single-select per group, e.g. Size)',
            items: { $ref: '#/components/schemas/VariantGroup' },
          },
          addonGroups: {
            type: 'array',
            description: 'Addon groups (multi-select per group, e.g. Extras)',
            items: { $ref: '#/components/schemas/AddonGroup' },
          },
          schedule: {
            nullable: true,
            allOf: [{ $ref: '#/components/schemas/ProductSchedule' }],
            description: 'Optional availability schedule; null = no time restriction',
          },
        },
      },
      ProductResponse: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Product ID' },
          shopId: { type: 'string', description: 'Shop ID' },
          name: { type: 'string', description: 'Product name' },
          description: { type: 'string', description: 'Product description' },
          price: { type: 'number', description: 'Product price in cents' },
          categories: {
            type: 'array',
            items: { $ref: '#/components/schemas/ProductCategory' },
            description: 'Product categories with full details',
          },
          images: {
            type: 'array',
            items: { $ref: '#/components/schemas/ProductImageRef' },
            description: 'Product images',
          },
          specialInfo: {
            type: 'array',
            items: { $ref: '#/components/schemas/SpecialInfoItem' },
            description: 'Special info items (dietary labels, badges, etc.)',
          },
          variantGroups: {
            type: 'array',
            items: { $ref: '#/components/schemas/VariantGroup' },
            description: 'Product variant groups (optional)',
          },
          addonGroups: {
            type: 'array',
            items: { $ref: '#/components/schemas/AddonGroup' },
            description: 'Product addon groups (optional)',
          },
          isAvailable: {
            type: 'boolean',
            description: 'Whether product is available',
          },
          isDeleted: {
            type: 'boolean',
            description: 'Whether product is deleted',
          },
          schedule: {
            nullable: true,
            allOf: [{ $ref: '#/components/schemas/ProductSchedule' }],
            description: 'Optional availability schedule; null = no time restriction',
          },
          taxRateId: {
            type: 'string',
            nullable: true,
            description: 'Tax rate ID from the shop\'s taxRates list, or null',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Creation timestamp',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Last update timestamp',
          },
        },
      },
      ProductsResponse: {
        type: 'array',
        items: { $ref: '#/components/schemas/ProductResponse' },
      },
      DeleteResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            description: 'Whether deletion was successful',
          },
        },
      },
      GenerateShopLogoUploadUrlRequest: {
        type: 'object',
        required: ['contentType'],
        properties: {
          contentType: {
            type: 'string',
            enum: ['image/jpeg', 'image/png', 'image/webp'],
            description: 'MIME type of the logo image to upload',
            example: 'image/jpeg',
          },
        },
      },
      GenerateShopLogoUploadUrlResponse: {
        type: 'object',
        required: ['imageId', 'uploadUrl', 'blobUrl', 'expiresAt'],
        properties: {
          imageId: {
            type: 'string',
            description: 'Unique identifier for the logo image',
            example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          },
          uploadUrl: {
            type: 'string',
            description: 'Pre-signed URL for uploading the logo to Azure Blob Storage',
          },
          blobUrl: {
            type: 'string',
            description: 'Permanent URL of the logo blob (without SAS token)',
          },
          expiresAt: {
            type: 'string',
            format: 'date-time',
            description: 'Expiration time of the upload URL',
          },
        },
      },
      SetShopLogoRequest: {
        type: 'object',
        required: ['imageId', 'url'],
        properties: {
          imageId: {
            type: 'string',
            description: 'Image ID returned from the logo upload URL generation',
            example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          },
          url: {
            type: 'string',
            description: 'Blob URL of the uploaded logo',
          },
        },
      },
      GenerateImageUploadUrlRequest: {
        type: 'object',
        required: ['contentType'],
        properties: {
          contentType: {
            type: 'string',
            enum: ['image/jpeg', 'image/png', 'image/webp'],
            description: 'MIME type of the image to upload',
            example: 'image/jpeg',
          },
          fileName: {
            type: 'string',
            description: 'Optional filename for the image',
            example: 'product-image.jpg',
          },
          maxSizeBytes: {
            type: 'integer',
            description: 'Optional maximum file size in bytes',
            example: 5242880,
          },
        },
      },
      GenerateImageUploadUrlResponse: {
        type: 'object',
        properties: {
          imageId: {
            type: 'string',
            description: 'Unique identifier for the image',
            example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          },
          uploadUrl: {
            type: 'string',
            description:
              'Pre-signed URL for uploading the image to Azure Blob Storage',
            example:
              'https://yourstorageaccount.blob.core.windows.net/product-media/shops/shop-123/products/product-456/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg?sv=2020-04-08&st=2024-01-01T12%3A00%3A00Z&se=2024-01-01T12%3A10%3A00Z&sr=b&sp=cw&sig=...',
          },
          blobUrl: {
            type: 'string',
            description: 'Permanent URL of the blob (without SAS token)',
            example:
              'https://yourstorageaccount.blob.core.windows.net/product-media/shops/shop-123/products/product-456/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg',
          },
          expiresAt: {
            type: 'string',
            format: 'date-time',
            description: 'Expiration time of the upload URL',
            example: '2024-01-01T12:10:00.000Z',
          },
        },
        required: ['imageId', 'uploadUrl', 'blobUrl', 'expiresAt'],
      },
      AddProductImageRequest: {
        type: 'object',
        required: ['imageId', 'url'],
        properties: {
          imageId: {
            type: 'string',
            description: 'Image ID returned from the upload URL generation',
            example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          },
          url: {
            type: 'string',
            description: 'Blob URL of the uploaded image',
            example:
              'https://yourstorageaccount.blob.core.windows.net/product-media/shops/shop-123/products/product-456/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg',
          },
          alt: {
            type: 'string',
            description: 'Alternative text for the image',
            example: 'Delicious pizza with pepperoni and cheese',
          },
          sortOrder: {
            type: 'integer',
            description: 'Sort order for displaying images',
            example: 1,
          },
        },
      },
      ProductImageResponse: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Image ID',
            example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          },
          url: {
            type: 'string',
            description: 'Image URL',
            example:
              'https://yourstorageaccount.blob.core.windows.net/product-media/shops/shop-123/products/product-456/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg',
          },
          alt: {
            type: 'string',
            description: 'Alternative text for the image',
            example: 'Delicious pizza with pepperoni and cheese',
          },
          sortOrder: {
            type: 'integer',
            description: 'Sort order for displaying images',
            example: 1,
          },
          isPrimary: {
            type: 'boolean',
            description: 'Whether this is the primary product image',
            example: false,
          },
        },
        required: ['id', 'url', 'sortOrder', 'isPrimary'],
      },
      CatalogProductDto: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Product ID' },
          name: { type: 'string', description: 'Product name' },
          description: { type: 'string', description: 'Product description' },
          price: { type: 'number', description: 'Base price in cents' },
          offerPrice: {
            type: 'integer',
            nullable: true,
            description: 'Special price in cents active during the scheduled window; null if no special price',
          },
          offerLabel: {
            type: 'string',
            nullable: true,
            description: 'Display label for the special price (e.g. "Happy hour"); null if not set',
          },
          images: {
            type: 'array',
            items: { $ref: '#/components/schemas/CatalogImageRef' },
          },
          variants: {
            type: 'array',
            description: 'Variant groups',
            items: { $ref: '#/components/schemas/VariantGroup' },
          },
          addons: {
            type: 'array',
            description: 'Addon groups',
            items: { $ref: '#/components/schemas/AddonGroup' },
          },
          isAvailable: { type: 'boolean' },
          taxRateId: { type: 'string', nullable: true, description: 'Tax rate ID or null' },
          specialInfo: {
            type: 'array',
            nullable: true,
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                icon: { type: 'string' },
              },
              required: ['name', 'icon'],
            },
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CatalogCategoryDto: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Category ID' },
          name: { type: 'string', description: 'Category name' },
          sortOrder: { type: 'number', description: 'Display sort order' },
          icon: { type: 'string', nullable: true, description: 'Lucide icon name' },
          products: {
            type: 'array',
            items: { $ref: '#/components/schemas/CatalogProductDto' },
          },
        },
      },
      CatalogResponse: {
        type: 'object',
        properties: {
          categories: {
            type: 'array',
            description: 'Categories with their visible, in-schedule products',
            items: { $ref: '#/components/schemas/CatalogCategoryDto' },
          },
        },
        required: ['categories'],
      },
      CheckoutItem: {
        type: 'object',
        required: ['productId', 'quantity'],
        properties: {
          productId: {
            type: 'string',
            description: 'Product ID',
            example: 'abc123',
          },
          quantity: {
            type: 'integer',
            minimum: 1,
            description: 'Quantity to order',
            example: 2,
          },
          selectedVariantOptionId: {
            type: 'string',
            description: 'ID of the selected variant option (e.g. size)',
            example: 'opt-uuid-large',
          },
          selectedAddonOptionIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'IDs of selected addon options',
            example: ['addon-cheese', 'addon-bacon'],
          },
        },
      },
      CheckoutRequest: {
        type: 'object',
        required: ['shopId', 'items', 'customerName', 'customerEmail', 'customerPhone'],
        properties: {
          shopId: {
            type: 'string',
            description: 'ID of the shop to order from',
            example: 'shop-uuid',
          },
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/CheckoutItem' },
            description: 'Items to order',
          },
          customerName: {
            type: 'string',
            description: 'Customer name',
            example: 'Jane Smith',
          },
          customerEmail: {
            type: 'string',
            format: 'email',
            description: 'Customer email',
            example: 'customer@example.com',
          },
          customerPhone: {
            type: 'string',
            description: 'Customer phone number',
            example: '+61412345678',
          },
          customerNotes: {
            type: 'string',
            description: 'Optional notes for the order',
            example: 'No onions please',
          },
          fulfilmentMode: {
            type: 'string',
            enum: ['collection', 'delivery', 'dine_in'],
            description: 'How the order is fulfilled (optional, defaults to collection). Only collection is available at the moment.',
            example: 'collection',
          },
        },
      },
      CheckoutResponse: {
        type: 'object',
        required: ['sessionId', 'clientSecret', 'subtotalCents', 'currency'],
        properties: {
          sessionId: {
            type: 'string',
            description: 'Checkout session ID',
            example: 'session-uuid',
          },
          clientSecret: {
            type: 'string',
            description: 'Stripe PaymentIntent client secret. Pass this to stripe.confirmPayment() on the frontend.',
            example: 'pi_3xxx_secret_yyy',
          },
          subtotalCents: {
            type: 'integer',
            description: 'Server-computed order total in cents',
            example: 3600,
          },
          currency: {
            type: 'string',
            description: 'ISO currency code from the shop',
            example: 'AUD',
          },
        },
      },
      OrdersPageResponse: {
        type: 'object',
        required: ['orders', 'total', 'page', 'pageSize'],
        properties: {
          orders: {
            type: 'array',
            items: { $ref: '#/components/schemas/OrderResponse' },
          },
          total: { type: 'integer', example: 142 },
          page: { type: 'integer', example: 1 },
          pageSize: { type: 'integer', example: 20 },
        },
      },
      OrderResponse: {
        type: 'object',
        required: [
          'id',
          'orderRef',
          'state',
          'displayState',
          'fulfilmentMode',
          'paymentMethod',
          'paymentStatus',
          'items',
          'subtotalCents',
          'currency',
          'customerName',
          'customerEmail',
          'customerPhone',
          'history',
          'createdAt',
        ],
        properties: {
          id: { type: 'string', format: 'uuid', example: 'order-uuid' },
          orderRef: { type: 'string', example: 'AB3-K7P' },
          state: {
            type: 'string',
            enum: ['PLACED', 'ACCEPTED', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'REJECTED', 'CANCELLED'],
            description: 'Stored lifecycle state',
            example: 'ACCEPTED',
          },
          displayState: {
            type: 'string',
            enum: ['PLACED', 'ACCEPTED', 'IN_PREPARATION', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'REJECTED', 'CANCELLED'],
            description: 'Derived state shown to users (IN_PREPARATION is never stored)',
            example: 'IN_PREPARATION',
          },
          fulfilmentMode: {
            type: 'string',
            enum: ['collection', 'delivery', 'dine_in'],
            example: 'collection',
          },
          paymentMethod: {
            type: 'string',
            enum: ['card', 'cash'],
            example: 'card',
          },
          paymentStatus: {
            type: 'string',
            enum: ['paid', 'refunded', 'partially_refunded', 'cash_due', 'cash_collected', 'refunded_in_cash'],
            example: 'paid',
          },
          readyAt: { type: 'string', format: 'date-time', nullable: true, example: '2026-03-02T10:20:00.000Z' },
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/OrderItemResponse' },
          },
          subtotalCents: { type: 'integer', example: 3600 },
          currency: { type: 'string', example: 'AUD' },
          customerName: { type: 'string', example: 'Jane Smith' },
          customerEmail: { type: 'string', format: 'email', example: 'jane@example.com' },
          customerPhone: { type: 'string', example: '+61400000000' },
          customerNotes: { type: 'string', nullable: true, example: 'No onions please' },
          history: {
            type: 'array',
            items: { $ref: '#/components/schemas/OrderHistoryEntry' },
          },
          createdAt: { type: 'string', format: 'date-time', example: '2026-03-02T10:00:00.000Z' },
        },
      },
      OrderHistoryEntry: {
        type: 'object',
        required: ['from', 'to', 'at', 'actor'],
        properties: {
          from: {
            type: 'string',
            nullable: true,
            enum: ['PLACED', 'ACCEPTED', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'REJECTED', 'CANCELLED'],
          },
          to: {
            type: 'string',
            enum: ['PLACED', 'ACCEPTED', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'REJECTED', 'CANCELLED'],
          },
          at: { type: 'string', format: 'date-time' },
          actor: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['system', 'customer', 'owner', 'staff', 'superadmin'] },
              id: { type: 'string', nullable: true },
            },
          },
          reason: { type: 'string', nullable: true },
        },
      },
      OrderItemResponse: {
        type: 'object',
        required: ['productId', 'productName', 'quantity', 'unitPriceCents', 'lineTotalCents'],
        properties: {
          productId: { type: 'string', example: 'prod-uuid' },
          productName: { type: 'string', example: 'Margherita Pizza' },
          quantity: { type: 'integer', minimum: 1, example: 2 },
          unitPriceCents: { type: 'integer', example: 1800 },
          selectedVariantOptionId: { type: 'string', nullable: true, example: 'opt-large' },
          selectedVariantOptionName: { type: 'string', nullable: true, example: 'Large' },
          selectedAddonOptionIds: {
            type: 'array',
            items: { type: 'string' },
            nullable: true,
            example: ['addon-extra-cheese'],
          },
          selectedAddonOptionNames: {
            type: 'array',
            items: { type: 'string' },
            nullable: true,
            example: ['Extra cheese'],
          },
          lineTotalCents: { type: 'integer', example: 3600 },
        },
      },
      OrderByPaymentIntentResponse: {
        type: 'object',
        required: [
          'orderId',
          'orderRef',
          'state',
          'displayState',
          'fulfilmentMode',
          'paymentStatus',
          'items',
          'subtotalCents',
          'currency',
          'customerName',
          'createdAt',
        ],
        properties: {
          orderId: { type: 'string', format: 'uuid', example: 'order-uuid' },
          orderRef: { type: 'string', example: 'AB3-K7P' },
          state: {
            type: 'string',
            enum: ['PLACED', 'ACCEPTED', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'REJECTED', 'CANCELLED'],
            example: 'ACCEPTED',
          },
          displayState: {
            type: 'string',
            enum: ['PLACED', 'ACCEPTED', 'IN_PREPARATION', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'REJECTED', 'CANCELLED'],
            example: 'IN_PREPARATION',
          },
          fulfilmentMode: {
            type: 'string',
            enum: ['collection', 'delivery', 'dine_in'],
            example: 'collection',
          },
          paymentStatus: {
            type: 'string',
            enum: ['paid', 'refunded', 'partially_refunded', 'cash_due', 'cash_collected', 'refunded_in_cash'],
            example: 'paid',
          },
          readyAt: { type: 'string', format: 'date-time', nullable: true, example: '2026-03-02T10:20:00.000Z' },
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/OrderItemResponse' },
          },
          subtotalCents: { type: 'integer', example: 3600 },
          currency: { type: 'string', example: 'AUD' },
          customerName: { type: 'string', example: 'Jane Smith' },
          createdAt: { type: 'string', format: 'date-time', example: '2026-03-02T10:00:00.000Z' },
        },
      },
    },
    responses: {
      BadRequest: {
        description: 'Bad request',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      Forbidden: {
        description: 'Forbidden - Authentication required or insufficient permissions',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      InternalError: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT Bearer token authentication',
      },
    },
  },
};
