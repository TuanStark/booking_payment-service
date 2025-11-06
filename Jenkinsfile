pipeline {
    agent any
    
    environment {
        SERVICE_NAME = 'payment-service'
        SERVICE_PORT = '3005'
        // Repository name trên Docker Hub: chỉ được có 1 dấu "/" (username/repo-name)
        // Không được dùng format: username/namespace/repo-name (2 dấu "/")
        DOCKER_IMAGE = "${SERVICE_NAME}"  // Sẽ thành: tuanstark/payment-service
        DOCKER_TAG = "${BUILD_NUMBER}"
        NODE_VERSION = '18'
        DATABASE_URL = credentials('database-url')
        // TODO: Thay đổi 'your-dockerhub-username' thành username Docker Hub của bạn
        DOCKER_HUB_USERNAME = 'tuanstark'
        // Docker Hub registry URL
        DOCKER_REGISTRY = 'https://index.docker.io/v1/'
        // LƯU Ý: Đây chỉ là ID tham chiếu, KHÔNG phải secret!
        // Username/password thực tế được lưu an toàn trong Jenkins Credentials Store
        // ID này chỉ để Jenkins biết lấy credentials nào từ store
        // TODO: Đảm bảo credentials ID này khớp với ID trong Jenkins Credentials
        DOCKER_CREDENTIALS_ID = 'docker-credentials'
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.GIT_COMMIT_SHORT = sh(
                        script: "git rev-parse --short HEAD",
                        returnStdout: true
                    ).trim()
                }
            }
        }
        
        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }
        
        stage('Lint & Format') {
            steps {
                sh 'npm run lint'
                sh 'npm run format'
            }
        }
        
        stage('Database Migration') {
            steps {
                sh 'npx prisma generate'
                sh 'npx prisma migrate deploy'
            }
        }
        
        stage('Unit Tests') {
            steps {
                sh 'npm test -- --coverage --watchAll=false'
            }
            post {
                always {
                    publishTestResults testResultsPattern: 'coverage/test-results.xml'
                    publishCoverage adapters: [
                        jacocoAdapter('coverage/lcov.info')
                    ], sourceFileResolver: sourceFiles('STORE_LAST_BUILD')
                }
            }
        }
        
        stage('Build Application') {
            steps {
                sh 'npm run build'
            }
        }
        
        stage('Build Docker Image') {
            steps {
                script {
                    sh "docker build -t ${DOCKER_IMAGE}:${DOCKER_TAG} -f ./Dockerfile ."
                }
            }
        }
        
        stage('Security Scan') {
            steps {
                script {
                    // Kiểm tra xem trivy có sẵn không
                    def trivyAvailable = sh(
                        script: 'which trivy || command -v trivy',
                        returnStatus: true
                    ) == 0
                    
                    if (trivyAvailable) {
                        sh "trivy image --exit-code 0 --severity HIGH,CRITICAL ${DOCKER_IMAGE}:${DOCKER_TAG}"
                    } else {
                        echo "⚠️ Trivy not found, skipping security scan. Install trivy to enable security scanning."
                    }
                }
            }
        }

        stage('Push Docker Image') {
            steps {
                script {
                    // Login to Docker Hub (sử dụng withCredentials để tránh expose secret)
                    withCredentials([usernamePassword(credentialsId: "${DOCKER_CREDENTIALS_ID}", usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
                        // Sử dụng sh với script block để tránh string interpolation
                        sh """
                            set +x  # Ẩn command để tránh expose password trong logs
                            echo "\$DOCKER_PASS" | docker login -u "\$DOCKER_USER" --password-stdin ${DOCKER_REGISTRY} || {
                                echo "❌ Docker login failed. Please check:"
                                echo "   1. Credentials ID '${DOCKER_CREDENTIALS_ID}' exists in Jenkins"
                                echo "   2. Username and password are correct"
                                echo "   3. Docker Hub account is active"
                                exit 1
                            }
                            set -x
                            
                            # Image name trên Docker Hub: username/repo-name:tag
                            # Docker Hub sẽ tự động tạo repository khi push lần đầu
                            DOCKER_HUB_IMAGE="\${DOCKER_USER}/${DOCKER_IMAGE}"
                            
                            # Tag image với Docker Hub username
                            echo "🏷️  Tagging image: ${DOCKER_IMAGE}:${DOCKER_TAG} -> \${DOCKER_HUB_IMAGE}:${DOCKER_TAG}"
                            docker tag ${DOCKER_IMAGE}:${DOCKER_TAG} \${DOCKER_HUB_IMAGE}:${DOCKER_TAG}
                            
                            echo "🏷️  Tagging image: ${DOCKER_IMAGE}:${DOCKER_TAG} -> \${DOCKER_HUB_IMAGE}:latest"
                            docker tag ${DOCKER_IMAGE}:${DOCKER_TAG} \${DOCKER_HUB_IMAGE}:latest
                            
                            # Push cả 2 tags (Docker Hub sẽ tự tạo repo nếu chưa tồn tại)
                            echo "📤 Pushing image: \${DOCKER_HUB_IMAGE}:${DOCKER_TAG}"
                            docker push \${DOCKER_HUB_IMAGE}:${DOCKER_TAG} || {
                                echo "❌ Push failed with 'insufficient_scope' error!"
                                echo ""
                                echo "🔍 This usually means your Access Token doesn't have write permissions."
                                echo ""
                                echo "✅ Solution:"
                                echo "   1. Go to: https://hub.docker.com/settings/security"
                                echo "   2. Create a NEW Access Token with 'Read, Write & Delete' permissions"
                                echo "   3. Update Jenkins credentials '${DOCKER_CREDENTIALS_ID}' with the new token"
                                echo "   4. Make sure to use Access Token (not password) in credentials"
                                echo ""
                                echo "📝 Current repository: \${DOCKER_HUB_IMAGE}"
                                exit 1
                            }
                            
                            echo "📤 Pushing image: \${DOCKER_HUB_IMAGE}:latest"
                            docker push \${DOCKER_HUB_IMAGE}:latest || {
                                echo "⚠️ Warning: Failed to push 'latest' tag, but version tag was pushed successfully"
                            }
                            
                            echo "✅ Successfully pushed images to Docker Hub"
                        """
                        
                        // Logout
                        sh "docker logout ${DOCKER_REGISTRY}"
                    }
                }
            }
        }
        
        // TODO: Uncomment when Docker registry and infrastructure are ready
        /*
        stage('Deploy to Staging') {
            when {
                branch 'develop'
            }
            steps {
                script {
                    sh """
                        kubectl set image deployment/${SERVICE_NAME} ${SERVICE_NAME}=${DOCKER_IMAGE}:${DOCKER_TAG} -n staging
                        kubectl rollout status deployment/${SERVICE_NAME} -n staging --timeout=300s
                    """
                }
            }
        }
        
        stage('Deploy to Production') {
            when {
                branch 'main'
            }
            steps {
                script {
                    sh """
                        kubectl set image deployment/${SERVICE_NAME} ${SERVICE_NAME}=${DOCKER_IMAGE}:${DOCKER_TAG} -n production
                        kubectl rollout status deployment/${SERVICE_NAME} -n production --timeout=300s
                    """
                }
            }
        }
        */
    }
    
    post {
        always {
            cleanWs()
        }
        success {
            script {
                // TODO: Uncomment when deployment is ready
                /*
                if (env.BRANCH_NAME == 'main') {
                    slackSend(
                        channel: '#deployments',
                        color: 'good',
                        message: "✅ ${SERVICE_NAME} deployed successfully to production! 💳"
                    )
                }
                */
                echo "✅ ${SERVICE_NAME} build completed successfully!"
            }
        }
        failure {
            script {
                // TODO: Uncomment when deployment is ready
                /*
                slackSend(
                    channel: '#deployments',
                    color: 'danger',
                    message: "❌ ${SERVICE_NAME} deployment failed! Check Jenkins logs."
                )
                */
                echo "❌ ${SERVICE_NAME} build failed! Check logs."
            }
        }
    }
    triggers {
        pollSCM('H/5 * * * *')
    }
}
