export const verificationValidationResponses = {
  "en": {
    "type": "ValidationFailure",
    "status": 400,
    "requestId": "request-reference",
    "errors": {
      "Code": [
        "Enter all 6 digits",
        "Enter all 6 digits"
      ]
    },
    "errorDetails": {
      "Code": [
        {
          "code": "ExactLengthValidator",
          "message": "Enter all 6 digits"
        },
        {
          "code": "VALIDATION_VERIFICATION_CODE_FORMAT",
          "message": "Enter all 6 digits"
        }
      ]
    }
  },
  "pt-BR": {
    "type": "ValidationFailure",
    "status": 400,
    "requestId": "request-reference",
    "errors": {
      "Code": [
        "Digite os 6 dígitos",
        "Digite os 6 dígitos"
      ]
    },
    "errorDetails": {
      "Code": [
        {
          "code": "ExactLengthValidator",
          "message": "Digite os 6 dígitos"
        },
        {
          "code": "VALIDATION_VERIFICATION_CODE_FORMAT",
          "message": "Digite os 6 dígitos"
        }
      ]
    }
  }
} as const
