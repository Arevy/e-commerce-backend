# GraphQL operations guide

Examples for the current [backend schema](../src/graphql/schema.ts), reviewed on October 11, 2026. This guide covers each domain and preserves the manual create/read/update/delete workflows. The schema is the authoritative list of fields and argument types; the operation inventory below includes fields without a full example.

## Environment and identity

Use `POST http://localhost:4000/graphql` or the application's same-origin proxy. Browser clients retain the HttpOnly session cookie (`sid` for customers, `support_sid` for support). Native clients send `Authorization: Bearer <token>` using the token returned by `login`. The token is linked to the active server session: logout or support revocation invalidates it. A JWT signature alone is insufficient.

For direct support requests when both cookies are present, send `x-shopx-support-session: 1` to prefer the support cookie. The admin proxy already does this. Use a separate customer session for customer flows and pass that user's actual ID. A `userId` argument does not grant permission to access another account.

Run one named operation at a time and supply its variables. Credentials must come from your private test configuration; no universal login/password is documented here. Registration returns a user, not an authenticated session: log in afterward. Keep cookie jars and Bearer tokens private.

## Test data and mutation scope

The demo reset contains 11 categories, 33 products, 16 users, 17 addresses, 23 orders, 41 order items, 23 payments, 15 cart items, 15 wishlist entries, eight CMS pages, and ten reviews. These counts describe a fresh isolated seed, not recovered `AREVY`, which includes later changes. See the [SQL guide](../README.md#schema-and-sql-script).

Use IDs returned by queries or by your own fixture creation. ID variables deliberately avoid binding examples to seed users or products. Derive totals from current responses instead of assuming sample prices.

Mutation examples create, modify, or delete records. Use a dedicated test schema and disposable fixtures, not the recovered catalog. Do not run `sql_script.txt` to prepare an existing application database: it drops tables. Sections are independent recipes rather than one script to execute top-to-bottom. In particular, retain an order until its payment checks finish, then remove dependent fixtures in reverse order.

## Authorization reference

| Operation family | Current requirement or limitation |
| --- | --- |
| Products/categories/review reads | Public queries |
| CMS reads | `getCmsPage` returns published content; `getCmsPages` defaults to PUBLISHED, but its explicit status filter still needs authorization review |
| Register/login | Public; login creates the server session |
| User context, cart, wishlist, addresses, orders, payment creation/read | Authenticated session and applicable ownership checks; SUPPORT paths are separate |
| `getUsers`, product/category/CMS writes, order-status/deletion, payment-status/deletion | SUPPORT, including legacy top-level fields |
| `customerSupport` | SUPPORT session required |
| Legacy top-level review mutations | Ownership/session enforcement is incomplete; these examples document the contract, not a completed security boundary |

## 1. Authentication & Users

### Verify Queries

```graphql
query AllUsers {
  getUsers {
    id
    email
    name
    role
  }
}
```

This legacy user-list query requires SUPPORT. Expect the users in the active schema, not a fixed seed-account list.

### Exercise Mutations

```graphql
mutation RegisterUser($email: String!, $password: String!, $name: String) {
  register(email: $email, password: $password, name: $name) {
    id
    email
  }
}

mutation LoginUser($email: String!, $password: String!) {
  login(email: $email, password: $password) {
    token
    user {
      id
      email
    }
  }
}
```

```graphql
mutation LogoutUser {
  logout
}
```

`login` sets the appropriate HttpOnly session cookie and returns a session-bound Bearer token. `logout` invalidates the session and expires the corresponding cookie. Admin tooling can revoke a customer's sessions; see the support section below.

Use the returned `id` from `register` for further flows (addresses, orders, etc.).

## 2. Catalog (Categories & Products)

### Verify Queries

```graphql
query CategoryListing {
  getCategories {
    id
    name
    description
  }
}

query ProductsByCategory($categoryId: ID!) {
  getProducts(categoryId: $categoryId) {
    id
    name
    price
    category {
      name
    }
    image {
      url
    }
  }
}

query ProductDetails($id: ID!) {
  getProductById(id: $id) {
    id
    name
    description
    price
    category {
      id
      name
    }
    image {
      url
      mimeType
    }
  }
}
```

### Mutation Flow (create → update → delete; SUPPORT required)

```graphql
mutation CreateCategoryAndProduct {
  newCategory: addCategory(name: "Accessories", description: "Laptop add-ons") {
    id
    name
  }
}
```

Take note of `newCategory.id`, then:

```graphql
mutation CreateAccessory($categoryId: ID!) {
  addProduct(
    name: "USB-C Hub"
    price: 79.99
    description: "7-in-1 USB-C hub"
    categoryId: $categoryId
    image: {filename: "hub.png", mimeType: "image/png", base64Data: "data:image/png;base64,iVBORw0..."}
  ) {
    id
    name
    price
    image {
      url
    }
  }
}
```

```graphql
mutation UpdateAccessory($productId: ID!) {
  updateProduct(
    id: $productId
    price: 69.99
    description: "Discounted hub"
    removeImage: true
  ) {
    id
    price
    description
    image {
      url
    }
  }
}

mutation DeleteAccessory($productId: ID!) {
  deleteProduct(id: $productId)
}

mutation DeleteAccessoriesCategory($categoryId: ID!) {
  deleteCategory(id: $categoryId)
}
```

`deleteCategory` succeeds only after the related product is removed.

> **Image uploads**: The example above truncates the base64 payload for brevity.
> Supply the full string returned by your uploader or `FileReader`. When
> replacing an asset you may omit `removeImage`; setting it to `true` clears the
> stored BLOB even if no new file is provided.

## 3. Cart

### Verify Query

```graphql
query CustomerCart($userId: ID!) {
  getCart(userId: $userId) {
    total
    items {
      product {
        id
        name
        price
        image {
          url
        }
      }
      quantity
    }
  }
}
```

Check `total` against the current product prices and quantities. `addToCart` accepts an integral delta: use `-1` to decrement; a resulting zero quantity removes the row. The real cart SQL is covered by the isolated SQL tests.

### Mutation Flow

```graphql
mutation AddCartItem($userId: ID!, $productId: ID!) {
  addToCart(userId: $userId, item: {productId: $productId, quantity: 1}) {
    total
    items {
      product {
        id
      }
      quantity
    }
  }
}

mutation RemoveCartItem($userId: ID!, $productId: ID!) {
  removeFromCart(userId: $userId, productId: $productId) {
    total
    items {
      product {
        id
      }
      quantity
    }
  }
}

mutation ClearCustomerCart($userId: ID!) {
  clearCart(userId: $userId)
}
```

`clearCart` returns `true` when the deletion succeeds.

## 4. Wishlist

### Verify Query

```graphql
query CustomerWishlist($userId: ID!) {
  getWishlist(userId: $userId) {
    products {
      id
      name
      price
    }
  }
}
```

### Mutation Flow

```graphql
mutation ToggleWishlist($userId: ID!, $productId: ID!, $productId2: ID!) {
  addToWishlist(userId: $userId, productId: $productId) {
    products {
      id
      name
    }
  }
  removeFromWishlist(userId: $userId, productId: $productId2) {
    products {
      id
      name
    }
  }
}
```

Run the mutations individually if you want to inspect intermediate states.

## 5. Reviews

### Verify Query

```graphql
query ProductReviews($productId: ID!) {
  getReviews(productId: $productId) {
    id
    rating
    reviewText
    userId
    createdAt
  }
}
```

Expect the stored reviews for the selected product. A product with no reviews returns an empty list. Review write authorization remains an open audit item.

### Mutation Flow

```graphql
mutation CreateReview($productId: ID!, $userId: ID!) {
  addReview(
    productId: $productId
    userId: $userId
    rating: 3
    reviewText: "Decent but pricey"
  ) {
    id
    rating
    reviewText
  }
}
```

Use the returned `id` (`$reviewId`) for the operations below:

```graphql
mutation UpdateReview($reviewId: ID!) {
  updateReview(
    reviewId: $reviewId
    rating: 4
    reviewText: "Improved after update"
  ) {
    id
    rating
    reviewText
  }
}

mutation DeleteReview($reviewId: ID!) {
  deleteReview(reviewId: $reviewId)
}
```

## 6. Addresses

### Verify Query

```graphql
query CustomerAddresses($userId: ID!) {
  getAddresses(userId: $userId) {
    id
    street
    city
    postalCode
    country
  }
}
```

### Mutation Flow

```graphql
mutation AddCustomerAddress($userId: ID!) {
  addAddress(
    userId: $userId
    street: "221B Baker Street"
    city: "London"
    postalCode: "NW1"
    country: "UK"
  ) {
    id
    street
  }
}
```

Capture the returned `id` (`$addressId`) for update/delete:

```graphql
mutation UpdateCustomerAddress($addressId: ID!) {
  updateAddress(addressId: $addressId, postalCode: "NW1 6XE") {
    id
    postalCode
  }
}

mutation DeleteCustomerAddress($addressId: ID!) {
  deleteAddress(addressId: $addressId)
}
```

## 7. User Context Aggregate

### Verify Query

```graphql
query CustomerContext($userId: ID!) {
  getUserContext(userId: $userId) {
    user {
      id
      email
      name
      role
    }
    cart {
      total
      items {
        quantity
        product {
          id
          name
          price
          image {
            url
          }
        }
      }
    }
    wishlist {
      products {
        id
        name
        price
        image {
          url
        }
      }
    }
    addresses {
      id
      street
      city
      postalCode
      country
    }
  }
}
```

The backend caches the aggregate under `user-context:<userId>` for 120 seconds. It hydrates the storefront after login. This authorized backend cache is separate from Next.js proxy caches, which bypass private/authenticated requests.

### Customer Support Variant

```graphql
query SupportUserContext($userId: ID!) {
  customerSupport {
    userContext(userId: $userId) {
      user {
        id
        email
        role
      }
      cart {
        total
        items {
          product {
            name
            image {
              url
            }
          }
          quantity
        }
      }
      wishlist {
        products {
          id
          name
          image {
            url
          }
        }
      }
      addresses {
        id
        street
        city
        postalCode
        country
      }
    }
  }
}
```

Use this call in the admin portal when investigating customer issues—the
payload mirrors the shopper-facing aggregate but stays scoped to the
`customerSupport` namespace.

### Redeem Impersonation Tokens

```graphql
mutation RedeemImpersonation($token: String!) {
  redeemImpersonation(token: $token) {
    id
    email
    name
    role
  }
}
```

Executing this mutation exchanges a short-lived impersonation ticket for a new
session (setting the `sid` cookie) and returns the impersonated user profile.
It is used by the storefront route `/impersonate?token=…` to mirror a customer
session opened from the admin portal.

## 8. Orders

### Verify Query

```graphql
query CustomerOrders($userId: ID!) {
  getOrders(userId: $userId) {
    id
    status
    total
    createdAt
    products {
      productId
      quantity
      price
    }
  }
}
```

### Mutation Flow

For a customer checkout, first add the selected quantities to that customer's cart. `OrderProductInput.price` remains required by the schema, but the backend reads authoritative prices from Oracle and consumes ordered cart lines transactionally. Use the returned `total` for payment registration. Shipping addresses are currently profile data, not order snapshots. Order-creation idempotency after a lost response remains open.

```graphql
mutation CreateOrderFromCart($userId: ID!, $productId: ID!, $productId2: ID!) {
  createOrder(
    userId: $userId
    products: [{productId: $productId, quantity: 1, price: 999.99}, {productId: $productId2, quantity: 2, price: 19.99}]
  ) {
    id
    status
    total
  }
}
```

Keep the returned ID as `$orderId`. The following status/delete operations require SUPPORT. Run deletion only after payment checks and cleanup:

```graphql
mutation ProgressOrder($orderId: ID!) {
  updateOrderStatus(orderId: $orderId, status: "FULFILLED")
}

mutation RemoveOrder($orderId: ID!) {
  deleteOrder(orderId: $orderId)
}
```

`deleteOrder` removes `ORDER_ITEMS` in the service transaction. Remove dependent payment records first; order deletion does not perform a financial refund.

## 9. Payments

### Verify Query

```graphql
query PaymentDetails($paymentId: ID!) {
  getPayment(paymentId: $paymentId) {
    id
    orderId
    amount
    method
    status
    createdAt
  }
}
```

### Mutation Flow

Use the `$orderId` from your order-creation response and set `$amount` to its returned `total`. The authenticated user must own the order (or use the applicable SUPPORT access). `createPayment` records PENDING state; it does not charge a card. Concurrent/repeated requests for the same order, amount, and method reuse a matching PENDING record.

```graphql
mutation CreatePayment($orderId: ID!, $amount: Float!) {
  createPayment(orderId: $orderId, amount: $amount, method: "CARD") {
    id
    status
  }
}
```

Use the returned `id` as `$paymentId`. Status changes and deletion below require SUPPORT. Setting `REFUNDED` only changes the database record; it does not execute a provider refund.

```graphql
mutation UpdatePayment($paymentId: ID!) {
  updatePaymentStatus(paymentId: $paymentId, status: "REFUNDED") {
    id
    status
  }
}

mutation DeletePayment($paymentId: ID!) {
  deletePayment(paymentId: $paymentId)
}
```

## 10. Miscellaneous Checks

- After any mutation, re-run the corresponding query to confirm the state change
  (e.g., `getCart`, `getWishlist`, `getOrders`).
- When testing cache-backed flows (cart/wishlist), hit the same query twice—the
  second call may use the backend cache if it has not been invalidated or expired. Identical responses alone do not prove a cache hit.
- For regressions or future features, extend this document with new scenarios so
  QA and frontend teams retain a single source of truth.

## 11. Customer Support Namespace

The `customerSupport` namespace groups administrative operations for SUPPORT sessions. It mirrors many commerce operations, but authentication and self-service profile/password fields remain at the root. Explicit customer/object IDs are still required where declared by the schema. Direct GraphiQL requests need a valid support session; cookie presence alone is insufficient. Prefer `support_sid` with `x-shopx-support-session: 1` when both cookies exist.

### Read Examples

Fetch all orders (optionally filter by `status` or `userId`) alongside support
roster details:

```graphql
query SupportOverview {
  customerSupport {
    users(role: SUPPORT) {
      id
      email
      role
    }
    orders(status: "PENDING") {
      id
      userId
      status
      total
    }
  }
}
```

Other helpful calls include `customerSupport.product(id: ID!)`,
`customerSupport.payments(orderId: ID)`, and `customerSupport.reviews(productId:
ID)`.

### Mutation Examples

In a disposable test schema, create an escalation contact, then add an address using the returned ID:

```graphql
mutation ProvisionSupportUser($email: String!, $password: String!) {
  customerSupport {
    createUser(
      email: $email
      password: $password
      name: "Escalation Desk"
      role: SUPPORT
    ) {
      id
      email
      role
    }
  }
}
```

Use the returned `id` in follow-up calls. Run dependent nested support operations as separate requests; do not assume nested fields form a serialized transaction:

```graphql
mutation UpdateSupportFixtures($userId: ID!) {
  customerSupport {
    addAddress(
      userId: $userId
      street: "400 Admin Way"
      city: "Austin"
      postalCode: "73301"
      country: "USA"
    ) {
      id
      street
    }
    updateUser(id: $userId, name: "Tier 2 Support") {
      id
      name
      role
    }
  }
}
```

```graphql
mutation RevokeCustomerSessions($userId: ID!) {
  customerSupport {
    logoutUserSessions(userId: $userId)
  }
}
```

```graphql
mutation StartImpersonation($userId: ID!) {
  customerSupport {
    impersonateUser(userId: $userId) {
      token
      expiresAt
    }
  }
}
```

Use the impersonation token to open the storefront as the customer by visiting
`http://localhost:3100/impersonate?token=<token>` (adjust the origin in
production). Redeeming the token issues a new session and refreshes the
cart/wishlist context for that user.

The namespace mirrors cart, wishlist, product, category, order, payment,
address, and review mutations, allowing the documented support workflows to use the same GraphQL entry point.

## 12. Profile and password

Both operations use the authenticated session's identity. A profile update requires the current password even if only the display name changes.

```graphql
mutation UpdateProfile($input: UpdateUserProfileInput!) {
  updateUserProfile(input: $input) {
    user {
      id
      name
      email
      role
    }
    message
  }
}

mutation ChangePassword($currentPassword: String!, $newPassword: String!) {
  changeUserPassword(currentPassword: $currentPassword, newPassword: $newPassword)
}
```

Supply credentials through private variables. Test incorrect-current-password and invalid-new-password responses on disposable accounts. Do not infer complete recovery/session-rotation behavior from a successful mutation alone.

## 13. CMS

Customers normally list published pages and fetch one by slug:

```graphql
query PublishedPages {
  getCmsPages(status: PUBLISHED) {
    id
    slug
    title
    excerpt
    publishedAt
  }
}

query PublishedPage($slug: String!) {
  getCmsPage(slug: $slug) {
    id
    slug
    title
    body
    status
    updatedAt
  }
}
```

SUPPORT can inspect drafts through `customerSupport.cmsPages` / `cmsPage`. The top-level listing's explicit status filter still needs a permission audit; do not assume unpublished content is protected by the current listing resolver.

The following writes require SUPPORT. `CmsPageInput` requires `slug`, `title`, and `body` for both create and update; provide all three. Valid statuses are `DRAFT`, `PUBLISHED`, and `ARCHIVED`.

```graphql
mutation CreatePage($input: CmsPageInput!) {
  createCmsPage(input: $input) {
    id
    slug
    title
    status
  }
}

mutation UpdatePage($id: ID!, $input: CmsPageInput!) {
  updateCmsPage(id: $id, input: $input) {
    id
    slug
    title
    status
  }
}

mutation PublishPage($id: ID!) {
  publishCmsPage(id: $id) {
    id
    slug
    status
    publishedAt
  }
}

mutation DeletePage($id: ID!) {
  deleteCmsPage(id: $id)
}
```

Backend CMS writes invalidate their own cache entries. Public Next.js responses may still be cached until TTL expiry or explicit invalidation. A `publishedAt` value does not establish a background publication scheduler.

## 14. Additional support examples

```graphql
query SupportSessionAndOrders($limit: Int, $offset: Int) {
  customerSupport {
    viewer {
      id
      name
      role
    }
    ordersConnection(limit: $limit, offset: $offset) {
      totalCount
      items {
        id
        userId
        total
        status
      }
    }
  }
}

mutation UpdateCategory($id: ID!, $name: String, $description: String) {
  updateCategory(id: $id, name: $name, description: $description) {
    id
    name
    description
  }
}

mutation DeleteTestUser($id: ID!) {
  customerSupport {
    deleteUser(id: $id)
  }
}
```

Delete only disposable users after cleaning dependent fixtures. The namespace also provides single-object lookups and filters listed below; consult schema arguments rather than assuming every operation has the same shape.

## 15. Schema operation inventory

This inventory is derived from the current schema. It preserves discoverability for fields without a full example above; return selections and arguments are defined in [schema.ts](../src/graphql/schema.ts). Schema validation checks syntax/types, not authorization or runtime behavior.

### Query

`getProducts`, `getProductById`, `getCategories`, `getUsers`, `getOrders`, `getCart`, `getWishlist`, `getUserContext`, `getReviews`, `getAddresses`, `getPayment`, `getCmsPages`, `getCmsPage`, `customerSupport`.

### Mutation

`addProduct`, `updateProduct`, `deleteProduct`, `addCategory`, `updateCategory`, `deleteCategory`, `register`, `login`, `logout`, `redeemImpersonation`, `updateUserProfile`, `changeUserPassword`, `createOrder`, `updateOrderStatus`, `deleteOrder`, `addToCart`, `removeFromCart`, `clearCart`, `addToWishlist`, `removeFromWishlist`, `addReview`, `updateReview`, `deleteReview`, `addAddress`, `updateAddress`, `deleteAddress`, `createPayment`, `updatePaymentStatus`, `deletePayment`, `createCmsPage`, `updateCmsPage`, `deleteCmsPage`, `publishCmsPage`, `customerSupport`.

### CustomerSupportQuery

`users`, `user`, `products`, `product`, `categories`, `category`, `viewer`, `orders`, `ordersConnection`, `order`, `addresses`, `address`, `payments`, `payment`, `cart`, `wishlist`, `userContext`, `reviews`, `review`, `cmsPages`, `cmsPage`.

### CustomerSupportMutation

`createUser`, `updateUser`, `deleteUser`, `logoutUserSessions`, `impersonateUser`, `addProduct`, `updateProduct`, `deleteProduct`, `addCategory`, `updateCategory`, `deleteCategory`, `createOrder`, `updateOrderStatus`, `deleteOrder`, `addAddress`, `updateAddress`, `deleteAddress`, `createPayment`, `updatePaymentStatus`, `deletePayment`, `addReview`, `updateReview`, `deleteReview`, `addToCart`, `removeFromCart`, `clearCart`, `addToWishlist`, `removeFromWishlist`, `createCmsPage`, `updateCmsPage`, `publishCmsPage`, `deleteCmsPage`.
