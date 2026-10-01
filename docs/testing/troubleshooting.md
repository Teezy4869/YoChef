# Testing Troubleshooting

Common testing issues and solutions for YoChef.

## NOT SPECIFIED

Testing troubleshooting is **NOT SPECIFIED** in the current repository.

**Update this file when testing infrastructure is implemented.**

## Common Issues

### Tests Not Running

```bash
# Install dependencies
npm install

# Check test script in package.json
cat package.json | grep test
```

### Database Connection in Tests

```javascript
// Use test database
const config = {
  database: {
    host: 'localhost',
    database: 'yochef_test'
  }
};
```

### Mocking Issues

```javascript
// Mock external services
jest.mock('axios');

// Mock database
jest.mock('../db', () => ({
  query: jest.fn()
}));
```

## Update When Implemented

Add actual troubleshooting steps.
