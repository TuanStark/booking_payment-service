# 🧪 Postman API Tests - Payment Service

## Base URL
```
http://localhost:3004
```

## 1. Test VietQR Configuration

**GET** `/payments/test/vietqr`

**Headers:**
```
Content-Type: application/json
```

**Expected Response:**
```json
{
  "success": true,
  "message": "VietQR configuration is working",
  "config": {
    "accountNo": "1033146127",
    "acqId": "970436",
    "accountName": "LE CONG TUAN"
  },
  "testPayment": {
    "qrImageUrl": "https://img.vietqr.io/image/970436-1033146127-compact2.jpg?...",
    "paymentUrl": "vietqr://transfer?accountNo=1033146127&acqId=970436&amount=100000&addInfo=BOOKING_TEST_123",
    "reference": "BOOKING_TEST_123"
  }
}
```

---

## 2. Create Payment with UUID

**POST** `/payments`

**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "userId": "user123",
  "bookingId": "bf5e9fb5-3556-4892-9c7d-15e7aaf27603",
  "amount": 500000,
  "method": "VIETQR"
}
```

**Expected Response:**
```json
{
  "id": "payment-uuid-here",
  "userId": "user123",
  "bookingId": "bf5e9fb5-3556-4892-9c7d-15e7aaf27603",
  "amount": 500000,
  "method": "VIETQR",
  "qrImageUrl": "https://img.vietqr.io/image/970436-1033146127-compact2.jpg?accountName=LE+CONG+TUAN&amount=500000&addInfo=BOOKING_bf5e9fb5&format=jpg",
  "paymentUrl": "vietqr://transfer?accountNo=1033146127&acqId=970436&amount=500000&addInfo=BOOKING_bf5e9fb5",
  "reference": "BOOKING_bf5e9fb5",
  "status": "PENDING",
  "createdAt": "2025-10-07T14:53:17.000Z",
  "updatedAt": "2025-10-07T14:53:17.000Z"
}
```

---

## 3. Get Payment by ID

**GET** `/payments/{payment-id}`

**Example:**
```
GET /payments/550e8400-e29b-41d4-a716-446655440000
```

**Expected Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user123",
  "bookingId": "bf5e9fb5-3556-4892-9c7d-15e7aaf27603",
  "amount": 500000,
  "method": "VIETQR",
  "qrImageUrl": "https://img.vietqr.io/image/970436-1033146127-compact2.jpg?...",
  "paymentUrl": "vietqr://transfer?...",
  "reference": "BOOKING_bf5e9fb5",
  "status": "PENDING",
  "createdAt": "2025-10-07T14:53:17.000Z",
  "updatedAt": "2025-10-07T14:53:17.000Z"
}
```

---

## 4. List All Payments

**GET** `/payments`

**Expected Response:**
```json
[
  {
    "id": "payment-uuid-1",
    "userId": "user123",
    "bookingId": "bf5e9fb5-3556-4892-9c7d-15e7aaf27603",
    "amount": 500000,
    "method": "VIETQR",
    "status": "PENDING",
    "createdAt": "2025-10-07T14:53:17.000Z",
    "updatedAt": "2025-10-07T14:53:17.000Z"
  }
]
```

---

## 5. Manual Payment Verification

**POST** `/payments/{payment-id}/verify`

**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "transactionId": "TXN123456789"
}
```

**Expected Response:**
```json
{
  "id": "payment-uuid-here",
  "userId": "user123",
  "bookingId": "bf5e9fb5-3556-4892-9c7d-15e7aaf27603",
  "amount": 500000,
  "method": "VIETQR",
  "status": "SUCCESS",
  "transactionId": "TXN123456789",
  "paymentDate": "2025-10-07T14:55:00.000Z",
  "createdAt": "2025-10-07T14:53:17.000Z",
  "updatedAt": "2025-10-07T14:55:00.000Z"
}
```

---

## 📱 Test Payment Flow

1. **Create Payment** - Sử dụng API #2 với UUID bookingId
2. **Get QR Code** - Copy `qrImageUrl` từ response
3. **Test Payment** - Scan QR code hoặc dùng `paymentUrl`
4. **Transfer Money** - Chuyển tiền với nội dung `reference` (ví dụ: `BOOKING_bf5e9fb5`)
5. **Verify Payment** - Sử dụng API #5 để verify thủ công

## 🔧 Error Cases to Test

### Invalid UUID
```json
{
  "userId": "user123",
  "bookingId": "invalid-uuid",
  "amount": 500000,
  "method": "VIETQR"
}
```

### Missing Required Fields
```json
{
  "userId": "user123",
  "amount": 500000,
  "method": "VIETQR"
}
```

### Invalid Payment Method
```json
{
  "userId": "user123",
  "bookingId": "bf5e9fb5-3556-4892-9c7d-15e7aaf27603",
  "amount": 500000,
  "method": "INVALID"
}
```

## 🎯 Expected Status Codes

- `200` - Success
- `400` - Bad Request (validation errors)
- `404` - Payment not found
- `500` - Internal server error
