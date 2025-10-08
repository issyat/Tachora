# Tachora - Advanced Retail Scheduling System

A comprehensive workforce scheduling solution designed for Belgian retail operations, featuring AI-powered optimization and multi-store management capabilities.

## 🚀 Features

### Core Scheduling
- **Multi-Store Management** - Centralized scheduling across multiple retail locations
- **AI-Powered Optimization** - CP-SAT solver for optimal shift assignments
- **Belgian Labor Law Compliance** - Built-in validation for local regulations
- **Real-Time Schedule Generation** - Instant optimization with drag-and-drop interface

### Employee Management
- **Work Type Specialization** - Assign employees to specific roles (cashier, stock, manager)
- **Cross-Store Flexibility** - Employees can work across multiple locations
- **Student Worker Protection** - Automatic 20-hour weekly limit enforcement
- **Availability Tracking** - Comprehensive time slot management

### Advanced Features
- **Store Hours Validation** - Ensures all shifts respect opening/closing times
- **Capacity Management** - Multi-employee shifts with dynamic capacity
- **Optimistic UI Updates** - Fast, responsive user experience
- **Professional Error Handling** - Structured error reporting with detailed feedback

## 🛠 Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: Node.js, Prisma ORM, PostgreSQL
- **Optimization**: Python CP-SAT Solver
- **Authentication**: Clerk
- **Deployment**: Vercel-ready

## 📋 Prerequisites

- Node.js 18+ and npm
- Python 3.8+ with pip
- PostgreSQL database
- Clerk account for authentication

## 🚀 Quick Start

### 1. Clone and Install
```bash
git clone https://github.com/issyat/Tachora.git
cd Tachora
npm install
```

### 2. Environment Setup
```bash
cp .env.example .env
# Configure your database URL and Clerk keys
```

### 3. Database Setup
```bash
npx prisma generate
npx prisma db push
npm run seed
```

### 4. Python Solver Setup
```bash
cd services/scheduler
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 5. Start Development
```bash
# Terminal 1: Next.js app
npm run dev

# Terminal 2: Python scheduler service
cd services/scheduler
python -m app.main
```

Visit [http://localhost:3000](http://localhost:3000) to access the application.

## 📊 System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Next.js App   │────│   Prisma ORM     │────│   PostgreSQL    │
│   (Frontend)    │    │   (Database)     │    │   (Database)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │
         │ HTTP API
         ▼
┌─────────────────┐    ┌──────────────────┐
│  Python Service │────│   CP-SAT Solver  │
│  (Optimization) │    │   (Google OR)    │
└─────────────────┘    └──────────────────┘
```

## 🎯 Key Components

- **Schedule Timeline** - Interactive calendar with drag-and-drop functionality
- **Employee Management** - Comprehensive staff administration
- **Work Type System** - Role-based assignment management
- **Store Configuration** - Multi-location setup and hours management
- **Optimization Engine** - AI-powered shift assignment

## 📈 Performance Features

- **Optimistic Updates** - Instant UI feedback
- **Efficient Algorithms** - Sub-second optimization for typical schedules
- **Scalable Architecture** - Supports multiple stores and hundreds of employees
- **Error Recovery** - Graceful handling of optimization failures

## 🔧 Development

### Database Operations
```bash
# Reset database
npx prisma db push --force-reset

# Generate test data
npm run seed

# View database
npx prisma studio
```

### Testing the Solver
```bash
cd services/scheduler
python -c "from app.solver.cpsat import solve_schedule; print('Solver ready!')"
```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support

For support and questions, please open an issue on GitHub or contact the development team.

---

Built with ❤️ for modern retail workforce management.
