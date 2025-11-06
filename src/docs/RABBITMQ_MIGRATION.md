# 🔄 RabbitMQ Migration - Payment Service

## 📋 Migration Summary

Payment Service đã được migrate từ Kafka sang RabbitMQ để xử lý messaging events.

## 🔄 Những thay đổi chính

### **1. RabbitMQ Producer Service**
- ✅ Tạo `RabbitMQProducerService` thay thế cho Kafka producer
- ✅ Hỗ trợ emit payment events và booking events
- ✅ Error handling và logging chi tiết

### **2. RabbitMQ Consumer Controller**
- ✅ Xử lý `booking.created` events để tạo payment tự động
- ✅ Xử lý `booking.canceled` events để cancel payment
- ✅ Proper acknowledgment và error handling

### **3. PaymentsService Updates**
- ✅ Thay thế `KafkaProducerService` bằng `RabbitMQProducerService`
- ✅ Cập nhật các method emit events
- ✅ Fix type issues và validation

### **4. Module Updates**
- ✅ `PaymentsModule`: Import `RabbitMQModule` thay vì `KafkaModule`
- ✅ `AppModule`: Import `RabbitMQModule` thay vì `KafkaModule`
- ✅ `EmailWatcherModule`: Import `RabbitMQModule` thay vì `KafkaModule`

### **5. Cleanup**
- ✅ Xóa `KafkaModule` và các Kafka dependencies
- ✅ Fix tất cả linting errors
- ✅ Cập nhật imports và references

## 🎯 Events được xử lý

### **Incoming Events (Consumer)**
- `booking.created` → Tạo payment PENDING
- `booking.canceled` → Cancel payment (PENDING → FAILED)

### **Outgoing Events (Producer)**
- `payment.success` → Payment thành công
- `payment.failed` → Payment thất bại
- `payment.status.updated` → Cập nhật status payment

## ⚙️ Configuration

### **Environment Variables:**
```env
RABBITMQ_URL=amqp://localhost:5672
RABBITMQ_QUEUE=booking.payments
```

### **RabbitMQ Settings:**
- Queue: `booking.payments` (durable)
- Prefetch Count: 1
- No Acknowledge: false

## 🚀 Benefits của RabbitMQ

1. **Reliability:** Message acknowledgment và durable queues
2. **Flexibility:** Routing patterns và exchange types
3. **Monitoring:** Built-in management UI
4. **Performance:** Lower latency cho small messages
5. **Simplicity:** Easier setup và configuration

## 🔄 Event Flow

### **Booking Created Flow:**
```
Booking Service → booking.created → Payment Service
Payment Service → Tạo payment PENDING → User thanh toán
Payment Service → payment.success → Other Services
```

### **Booking Canceled Flow:**
```
Booking Service → booking.canceled → Payment Service
Payment Service → Update payment FAILED → Other Services
```

## 📝 Testing

Để test RabbitMQ integration:

1. **Start RabbitMQ:** `docker-compose up rabbitmq`
2. **Start Payment Service:** `npm run start:dev`
3. **Send test events:** Sử dụng RabbitMQ management UI hoặc test scripts

## 🔧 Troubleshooting

### **Common Issues:**
- **Connection failed:** Check RABBITMQ_URL
- **Queue not found:** Check RABBITMQ_QUEUE
- **Message not processed:** Check consumer logs

### **Debug Commands:**
```bash
# Check RabbitMQ status
docker ps | grep rabbitmq

# View logs
docker logs payment-service

# Check queue status
curl http://localhost:15672/api/queues
```
