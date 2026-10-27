import { Controller, Get } from "@nestjs/common";
import { AppError } from "../common/app-error.js";

// Replaced by the real /api/me in Task 7.
@Controller("me")
export class MePlaceholderController {
  @Get()
  me(): never {
    throw new AppError("unauthenticated");
  }
}
