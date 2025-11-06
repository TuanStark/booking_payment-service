<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

Payment Service for Booking Platform - Handles payment processing with VietQR and email verification.

## Features

- 💳 VietQR payment integration
- 📧 Email-based payment verification
- 🔄 Kafka event publishing
- 📊 Payment status tracking
- 🏦 Bank account configuration

## Environment Setup

Create a `.env` file in the root directory with the following variables:

```env
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5437/payment_db"

# VietQR Configuration (Bank Account Details)
VIETQR_ACCOUNT_NO=0123456789
VIETQR_ACQ_ID=970418
VIETQR_ACCOUNT_NAME=Dormitory Booking

# IMAP Email Configuration (for payment verification)
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=your-email@gmail.com
IMAP_PASS=your-app-password

# Kafka Configuration
KAFKA_BROKER=localhost:9092
KAFKA_CLIENT_ID=payment-service

# Server Configuration
PORT=3004
```

### VietQR Setup

1. **Get Bank Account Details:**
   - `VIETQR_ACCOUNT_NO`: Your bank account number
   - `VIETQR_ACQ_ID`: Bank code (e.g., 970418 for Vietcombank)
   - `VIETQR_ACCOUNT_NAME`: Account holder name

2. **Bank Codes Reference:**
   - Vietcombank: 970436
   - BIDV: 970418
   - Agribank: 970405
   - Techcombank: 970407
   - VPBank: 970432

### Email Verification Setup

1. **Gmail Setup:**
   - Enable 2-factor authentication
   - Generate App Password for IMAP access
   - Use App Password as `IMAP_PASS`

2. **Other Email Providers:**
   - Update `IMAP_HOST` and `IMAP_PORT` accordingly
   - Use appropriate authentication method

## Quick Setup

```bash
# 1. Install dependencies
$ npm install

# 2. Run interactive setup
$ npm run setup

# 3. Run database migrations
$ npm run db:migrate

# 4. Start the service
$ npm run start:dev
```

## Manual Setup

```bash
# 1. Install dependencies
$ npm install

# 2. Copy environment template
$ cp .env.example .env

# 3. Edit .env file with your configuration
$ nano .env

# 4. Run database migrations
$ npm run db:migrate

# 5. Generate Prisma client
$ npm run db:generate

# 6. Start the service
$ npm run start:dev
```

## API Endpoints

### Payment Management
- `POST /payments` - Create new payment
- `GET /payments/:id` - Get payment by ID
- `GET /payments` - List all payments
- `POST /payments/:id/verify` - Manually verify payment

### Testing & Configuration
- `GET /payments/test/vietqr` - Test VietQR configuration

### Example Usage

```bash
# Create a payment
curl -X POST http://localhost:3004/payments \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "bookingId": "booking456",
    "amount": 500000,
    "method": "VIETQR"
  }'

# Test VietQR configuration
curl http://localhost:3004/payments/test/vietqr

# Manually verify payment
curl -X POST http://localhost:3004/payments/payment-id/verify \
  -H "Content-Type: application/json" \
  -d '{"transactionId": "TXN123456"}'
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
