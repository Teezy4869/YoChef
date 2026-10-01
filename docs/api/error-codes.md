# Error Codes

Error codes used in YoChef API responses.

## NOT SPECIFIED

The exact error codes are **NOT SPECIFIED** in the current documentation.

**When implementing, document actual error codes here.**

## Expected Error Codes

### Authentication Errors

| Code | HTTP | Description |
|------|------|-------------|
| `AUTH_INVALID_CREDENTIALS` | 401 | Invalid email/password |
| `AUTH_TOKEN_EXPIRED` | 401 | JWT token expired |
| `AUTH_TOKEN_INVALID` | 401 | Invalid JWT token |
| `AUTH_NOT_AUTHORIZED` | 403 | Not authorized for action |

### Validation Errors

| Code | HTTP | Description |
|------|------|-------------|
| `VALIDATION_REQUIRED` | 400 | Required field missing |
| `VALIDATION_FORMAT` | 400 | Invalid format |
| `VALIDATION_RANGE` | 400 | Value out of range |
| `VALIDATION_TYPE` | 400 | Wrong data type |

### Resource Errors

| Code | HTTP | Description |
|------|------|-------------|
| `RESOURCE_NOT_FOUND` | 404 | Resource not found |
| `RESOURCE_ALREADY_EXISTS` | 409 | Resource already exists |
| `RESOURCE_DELETED` | 410 | Resource was deleted |

### Server Errors

| Code | HTTP | Description |
|------|------|-------------|
| `INTERNAL_ERROR` | 500 | Internal server error |
| `DATABASE_ERROR` | 500 | Database operation failed |
| `EXTERNAL_SERVICE_ERROR` | 502 | External service unavailable |

## Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {
      "field": "additional info"
    }
  }
}
```

## Update When Implemented

When the API is implemented:

1. Document actual error codes
2. Document error messages
3. Document recovery actions
