export interface IPaymentProvider {
    createPayment(data: any): Promise<any>;
    verifyPayment(data: any): Promise<{ verified: boolean; transactionCode?: string }>;
}
