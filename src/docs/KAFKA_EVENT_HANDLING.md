# 🔄 Kafka Event Handling - Payment Service

## 📋 Tổng quan

Payment Service nhận các event từ Kafka để tự động tạo và quản lý payment records dựa trên các sự kiện booking.

## 🎯 Các Event được xử lý

### **1. Booking Events**

#### **`booking.created`**
```json
{
  "bookingId": "bf5e9fb5-3556-4892-9c7d-15e7aaf27603",
  "userId": "user-uuid",
  "roomId": "room-uuid",
  "amount": 500000,
  "startDate": "2025-10-07T00:00:00Z",
  "endDate": "2025-10-10T00:00:00Z"
}
```

**Xử lý:**
- ✅ Kiểm tra các trường bắt buộc (bookingId, userId, amount)
- ✅ Kiểm tra xem đã có payment cho booking này chưa
- ✅ Tạo payment record với status `PENDING`
- ✅ Sử dụng method `VIETQR` mặc định
- ✅ Log thành công

#### **`booking.canceled`**
```json
{
  "bookingId": "bf5e9fb5-3556-4892-9c7d-15e7aaf27603",
  "userId": "user-uuid",
  "reason": "User canceled"
}
```

**Xử lý:**
- ✅ Kiểm tra bookingId có tồn tại không
- ✅ Tìm payment liên quan đến booking
- ✅ Kiểm tra payment status hiện tại
- ✅ Cancel payment nếu status là `PENDING`
- ✅ Log thành công

## 🔄 Luồng hoạt động

### **Scenario 1: Booking thành công**
```
1. Booking Service tạo booking → booking.created event
2. Payment Service nhận event → Tạo payment PENDING
3. User thanh toán → Payment status: PENDING → SUCCESS
4. Payment Service gửi payment.success event
```

### **Scenario 2: Booking bị hủy trước khi thanh toán**
```
1. Booking Service tạo booking → booking.created event
2. Payment Service nhận event → Tạo payment PENDING
3. User hủy booking → booking.canceled event
4. Payment Service nhận event → Payment status: PENDING → FAILED
```

### **Scenario 3: Booking bị hủy sau khi thanh toán**
```
1. Booking Service tạo booking → booking.created event
2. Payment Service nhận event → Tạo payment PENDING
3. User thanh toán → Payment status: PENDING → SUCCESS
4. User hủy booking → booking.canceled event
5. Payment Service nhận event → Không thay đổi (đã SUCCESS)
```

## 🛡️ Error Handling

### **Validation Checks:**
- ✅ Kiểm tra các trường bắt buộc trong event
- ✅ Kiểm tra payment đã tồn tại chưa
- ✅ Kiểm tra payment status hợp lệ

### **Error Cases:**
- ❌ Missing required fields → Log warning, skip
- ❌ Payment already exists → Log info, skip
- ❌ Payment already completed → Log info, skip
- ❌ Database error → Log error, throw exception

## 📊 Payment Status Flow

```
booking.created → Payment PENDING
    ↓
booking.canceled → Payment FAILED (nếu PENDING)
    ↓
User payment → Payment SUCCESS (manual/email verification)
```

## 🔍 Reference Matching

Payment Service sử dụng **short reference** để match với booking:

```typescript
// Booking ID: bf5e9fb5-3556-4892-9c7d-15e7aaf27603
// Reference: BOOKING_bf5e9fb5 (8 ký tự đầu)
const reference = `BOOKING_${bookingId.substring(0, 8)}`;
```

## 🧪 Testing

### **Test với Kafka Events:**

#### **1. Test booking.created:**
```bash
# Gửi event qua Kafka
{
  "topic": "booking.created",
  "message": {
    "bookingId": "bf5e9fb5-3556-4892-9c7d-15e7aaf27603",
    "userId": "user123",
    "roomId": "room456",
    "amount": 500000,
    "startDate": "2025-10-07T00:00:00Z",
    "endDate": "2025-10-10T00:00:00Z"
  }
}

# Kết quả mong đợi:
# ✅ Payment created for booking bf5e9fb5-3556-4892-9c7d-15e7aaf27603: payment-uuid
```

#### **2. Test booking.canceled:**
```bash
# Gửi event qua Kafka
{
  "topic": "booking.canceled", 
  "message": {
    "bookingId": "bf5e9fb5-3556-4892-9c7d-15e7aaf27603",
    "userId": "user123",
    "reason": "User canceled"
  }
}

# Kết quả mong đợi:
# ✅ Payment payment-uuid canceled for booking bf5e9fb5-3556-4892-9c7d-15e7aaf27603
```

## 📝 Logs mẫu

```
📩 [Kafka] Booking created event received: { bookingId: "bf5e9fb5-3556-4892-9c7d-15e7aaf27603", userId: "user123", amount: 500000 }
✅ Payment created for booking bf5e9fb5-3556-4892-9c7d-15e7aaf27603: payment-uuid-123

📩 [Kafka] Booking canceled event received: { bookingId: "bf5e9fb5-3556-4892-9c7d-15e7aaf27603", userId: "user123", reason: "User canceled" }
✅ Payment payment-uuid-123 canceled for booking bf5e9fb5-3556-4892-9c7d-15e7aaf27603
```

## ⚙️ Configuration

### **Kafka Topics:**
- `booking.created` - Nhận từ Booking Service
- `booking.canceled` - Nhận từ Booking Service

### **Environment Variables:**
```env
KAFKA_BROKER=localhost:9092
KAFKA_CLIENT_ID=payment-service
KAFKA_GROUP_ID=payment-group
```

## 🚀 Benefits

1. **Tự động hóa:** Payment được tạo tự động khi có booking
2. **Consistency:** Đảm bảo mỗi booking có payment tương ứng
3. **Real-time:** Phản ứng ngay khi có booking event
4. **Reliable:** Có error handling và validation
5. **Scalable:** Có thể handle nhiều booking đồng thời

## 🔄 Integration với các Service khác

### **Payment Service → Room Service:**
- Payment Service gửi `payment.success` → Room Service nhận → Room status BOOKED
- Payment Service gửi `payment.failed` → Room Service nhận → Room status AVAILABLE

### **Booking Service → Payment Service:**
- Booking Service gửi `booking.created` → Payment Service nhận → Tạo payment PENDING
- Booking Service gửi `booking.canceled` → Payment Service nhận → Cancel payment
