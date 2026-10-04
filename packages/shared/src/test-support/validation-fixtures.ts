export const verificationValidationResponses = {
  "en": {
    "type": "ValidationFailure",
    "status": 400,
    "requestId": "request-reference",
    "errors": {
      "Code": [
        "'Code' must be 6 characters in length. You entered 5 characters.",
        "Code must be a 6-digit number"
      ]
    },
    "errorDetails": {
      "Code": [
        {
          "code": "ExactLengthValidator",
          "message": "'Code' must be 6 characters in length. You entered 5 characters."
        },
        {
          "code": "VALIDATION_VERIFICATION_CODE_FORMAT",
          "message": "Code must be a 6-digit number"
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
        "'Code' deve ter exatamente 6 caracteres. Você digitou 5 caracteres.",
        "O código deve ter 6 dígitos"
      ]
    },
    "errorDetails": {
      "Code": [
        {
          "code": "ExactLengthValidator",
          "message": "'Code' deve ter exatamente 6 caracteres. Você digitou 5 caracteres."
        },
        {
          "code": "VALIDATION_VERIFICATION_CODE_FORMAT",
          "message": "O código deve ter 6 dígitos"
        }
      ]
    }
  }
} as const
