import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ZodError } from 'zod';

import { Controller } from '@application/contracts/Controller';
import { ErrorCode } from '@application/errors/ErrorCode';
import { HttpError } from '@application/errors/http/HttpError';
import { lambdaBodyParser } from '@main/utils/lambdaBodyParser';
import { lambdaErrorResponse } from '@main/utils/lambdaErrorResponse';

/**
 * Adapts a generic controller to work with AWS Lambda proxy integration (v2).
 *
 * This adapter converts API Gateway proxy events into a format the controller can process,
 * executes the controller, and transforms the response back into an API Gateway proxy result.
 *
 * @template T - The type of the controller's expected input
 * @param controller - The controller instance to be adapted for Lambda execution
 * @returns An async function that handles API Gateway proxy events and returns proxy results
 *
 * @remarks
 * The adapter performs the following operations:
 * - Parses the request body from the Lambda event
 * - Extracts path parameters and query string parameters
 * - Executes the controller with the parsed request data
 * - Handles errors with appropriate HTTP status codes:
 *   - ZodError: Returns 400 with validation error details
 *   - HttpError: Returns the error's status code and message
 *   - Unknown errors: Returns 500 Internal Server Error
 *
 * @example
 * ```typescript
 * const handler = lambdaHttpAdapter(myController);
 * export { handler };
 * ```
 */
export function lambdaHttpAdapter(controller: Controller<unknown>) {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
      const body = lambdaBodyParser(event.body);
      const params = event.pathParameters ?? {};
      const queryParams = event.queryStringParameters ?? {};

      const response = await controller.execute({
        body,
        params,
        queryParams,
      });

      return {
        statusCode: response.statusCode,
        body: response.body ? JSON.stringify(response.body) : undefined,
      };
    } catch (error) {
      if (error instanceof ZodError) {
        return lambdaErrorResponse({
          statusCode: 400,
          code: ErrorCode.VALIDATION,
          message: error.issues.map(issue => ({
            field: issue.path.join('.'),
            error: issue.message,
          })),
        });
      }

      if (error instanceof HttpError) {
        return lambdaErrorResponse(error);
      }

      // eslint-disable-next-line no-console
      console.log(error);

      return lambdaErrorResponse({
        statusCode: 500,
         code: ErrorCode.INTERNAL_SERVER_ERROR,
          message: 'Internal server error.',
      });
    }
  };
}
