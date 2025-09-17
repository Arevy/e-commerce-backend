# GraphQL Operations Catalogue

Reference guide covering every query and mutation exposed by the backend, plus a
verification playbook so you can exercise each resolver end-to-end. All seeded
IDs originate from `sql_script.txt`, which rebuilds the schema from scratch on
every run.

> **Identity note**: Until context-based auth is implemented (see
> `docs/backend-backlog.md`), mutations accept `userId` arguments directly. The
> new `customerSupport` namespace follows the same rule. Use the seeded users
> (including the support agent) or register fresh accounts during testing.

## Seeded Dataset Snapshot
- **Users**
  - `alice@example.com` (`Password123!`, role `CUSTOMER`) → `id = 1`
  - `bob@example.com` (`Password123!`, role `CUSTOMER`) → `id = 2`
  - `support@example.com` (`Password123!`, role `SUPPORT`) → `id = 3`
- **Categories**
  - `1 = Electronics`, `2 = Books`, `3 = Clothing`
- **Products**
  - `1 = Laptop`, `2 = Smartphone`, `3 = Novel`
- **Orders & Payments**
  - Order `1` (Alice) pending, total `1499.98`, payment `1` authorised
  - Order `2` (Bob) shipped, total `19.99`, payment `2` captured
- **Miscellaneous**
  - Alice cart: Laptop ×1, Smartphone ×2
  - Alice wishlist: Novel; Bob wishlist: Laptop
  - Reviews seeded for each product (IDs start at 1)

The sections below first confirm read-side behaviour with the seeded data, then
walk through create/update/delete flows that generate additional fixtures you
can reuse for subsequent checks.

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
Expected: the seeded customers plus the support agent.

### Exercise Mutations
```graphql
mutation RegisterUser {
  register(email: "charlie@example.com", password: "Sup3rSecret!", name: "Charlie") {
    id
    email
  }
}

mutation LoginAlice {
  login(email: "alice@example.com", password: "Password123!") {
    token
    user {
      id
      email
    }
  }
}
```
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

query ElectronicsOnly {
  getProducts(categoryId: 1) {
    id
    name
    price
    category { name }
  }
}

query ProductDetails {
  getProductById(id: 1) {
    id
    name
    description
    price
    category { id name }
  }
}
```

### Mutation Flow (create → update → delete)
```graphql
# 1. Create a disposable category + product
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
  ) {
    id
    name
    price
  }
}
```

```graphql
mutation UpdateAccessory($productId: ID!) {
  updateProduct(id: $productId, price: 69.99, description: "Discounted hub") {
    id
    price
    description
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

## 3. Cart
### Verify Query
```graphql
query AliceCart {
  getCart(userId: 1) {
    total
    items {
      product { id name price }
      quantity
    }
  }
}
```
Expected total: `999.99 + (2 × 499.99) = 1999.97`.

### Mutation Flow
```graphql
mutation AddNovelToCart {
  addToCart(userId: 1, item: { productId: 3, quantity: 1 }) {
    total
    items { product { id } quantity }
  }
}

mutation RemoveLaptopFromCart {
  removeFromCart(userId: 1, productId: 1) {
    total
    items { product { id } quantity }
  }
}

mutation ClearBobCart {
  clearCart(userId: 2)
}
```
`clearCart` returns `true` when the deletion succeeds.

## 4. Wishlist
### Verify Query
```graphql
query BobWishlist {
  getWishlist(userId: 2) {
    products { id name price }
  }
}
```

### Mutation Flow
```graphql
mutation ToggleWishlist {
  addToWishlist(userId: 1, productId: 2) {
    products { id name }
  }
  removeFromWishlist(userId: 1, productId: 3) {
    products { id name }
  }
}
```
Run the mutations individually if you want to inspect intermediate states.

## 5. Reviews
### Verify Query
```graphql
query LaptopReviews {
  getReviews(productId: 1) {
    id
    rating
    reviewText
    userId
    createdAt
  }
}
```
Expected: at least one review from Alice with rating `5`.

### Mutation Flow
```graphql
mutation CreateReview {
  addReview(productId: 2, userId: 1, rating: 3, reviewText: "Decent but pricey") {
    id
    rating
    reviewText
  }
}
```
Use the returned `id` (`$reviewId`) for the operations below:

```graphql
mutation UpdateReview($reviewId: ID!) {
  updateReview(reviewId: $reviewId, rating: 4, reviewText: "Improved after update") {
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
query AliceAddresses {
  getAddresses(userId: 1) {
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
mutation AddBobAddress {
  addAddress(
    userId: 2
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
mutation UpdateBobAddress($addressId: ID!) {
  updateAddress(addressId: $addressId, postalCode: "NW1 6XE") {
    id
    postalCode
  }
}

mutation DeleteBobAddress($addressId: ID!) {
  deleteAddress(addressId: $addressId)
}
```

## 7. Orders
### Verify Query
```graphql
query AliceOrders {
  getOrders(userId: 1) {
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
```graphql
mutation CreateOrderFromCart {
  createOrder(
    userId: 2
    products: [
      { productId: 1, quantity: 1, price: 999.99 }
      { productId: 3, quantity: 2, price: 19.99 }
    ]
  ) {
    id
    status
    total
  }
}
```
Let the returned order ID be `$orderId`:

```graphql
mutation ProgressOrder($orderId: ID!) {
  updateOrderStatus(orderId: $orderId, status: "FULFILLED")
}

mutation RemoveOrder($orderId: ID!) {
  deleteOrder(orderId: $orderId)
}
```
`deleteOrder` also cleans up `ORDER_ITEMS` via cascading logic in the service.

## 8. Payments
### Verify Query
```graphql
query PaymentDetails {
  getPayment(paymentId: 1) {
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
Use the `$orderId` produced in the order flow above (or order `1`) to create a
new payment. Match the `amount` to the order total (`1499.98` for the seeded
order, `1039.97` for the sample order in the previous section), then mutate it:

```graphql
mutation CreatePayment($orderId: ID!, $amount: Float!) {
  createPayment(orderId: $orderId, amount: $amount, method: "CARD") {
    id
    status
  }
}
```
Take the returned `payment.id` as `$paymentId`:

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

## 9. Miscellaneous Checks
- After any mutation, re-run the corresponding query to confirm the state change
  (e.g., `getCart`, `getWishlist`, `getOrders`).
- When testing cache-backed flows (cart/wishlist), hit the same query twice—the
  second call should be served from Redis if available.
- For regressions or future features, extend this document with new scenarios so
  QA and frontend teams retain a single source of truth.

## 10. Customer Support Namespace
The `customerSupport` field exposes a grouped set of resolvers tailored for
support agents. Every query/mutation available to shoppers is mirrored here so
agents can audit or remediate data without juggling user-specific IDs. Because
Auth context is still TODO, you can call the namespace directly once you have an
API token (or while running GraphiQL locally).

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
Create a dedicated escalation contact, then immediately seed them with a
shipping address:

```graphql
mutation ProvisionSupportUser {
  customerSupport {
    createUser(
      email: "agent2@example.com"
      password: "AnotherSup3rSecret!"
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
Take the returned `id` and stitch in follow-up calls:

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

The namespace mirrors cart, wishlist, product, category, order, payment,
address, and review mutations, so any remediation workflow that exists today can
be run on behalf of customers from the same GraphQL entry point.
