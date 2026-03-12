# Guide to Logs Microservices Project

## Overview

This project is designed to provide a robust, scalable logging solution for microservices architecture. It aims to centralize logs for easier monitoring and debugging.

## Components

- **Service A**: Responsible for collecting logs from microservices and sending them to the central logging service.
- **Service B**: Manages log storage and provides a REST API for querying logs.
- **Service C**: A simple dashboard to visualize logs in real-time.

## Technical Decisions

- **Log Format**: JSON with structured data for easier parsing and analysis.
- **Communication Protocol**: HTTP for Service A and B, WebSocket for real-time updates in Service C.
- **Database**: PostgreSQL for storing logs to ensure data integrity and performance.

## Trade-offs

- **Performance vs. Storage**: Choosing a more performant database comes with a cost in terms of storage and maintenance.
- **Complexity vs. Maintainability**: More complex solutions can be harder to maintain but offer more flexibility.

## How to Run

1. **Clone the Repository**:
   ```sh
   git clone https://github.com/yourusername/logs-microservices.git
   ```

2. **Navigate to the Directory**:
   ```sh
   cd logs-microservices
   ```

3. **Setup Environment Variables**:
   ```sh
   cp .env.example .env
   ```

4. **Install Dependencies**:
   ```sh
   npm install
   ```

5. **Start the Services**:
   - **Service A**:
     ```sh
     npm run service-a
     ```
   - **Service B**:
     ```sh
     npm run service-b
     ```
   - **Service C**:
     ```sh
     npm run service-c
     ```

6. **Access the Dashboard**:
   - Open your browser and navigate to `http://localhost:3000`.

## Contributing

Feel free to contribute by submitting issues or pull requests. We welcome any improvements or suggestions.