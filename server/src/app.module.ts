import { Controller, Get, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ScheduleModule } from "@nestjs/schedule";
import { ModelsModule } from "./common/models.js";
import { Permissions } from "./common/permissions.js";
import { JobsService } from "./jobs/jobs.service.js";
import { AuthService } from "./auth/auth.service.js";
import { AuthController } from "./auth/auth.controller.js";
import { UsersService } from "./users/users.service.js";
import { UsersController } from "./users/users.controller.js";
import { CirclesService } from "./circles/circles.service.js";
import { CirclesController } from "./circles/circles.controller.js";
import { PlansService } from "./plans/plans.service.js";
import { PlansController } from "./plans/plans.controller.js";
import { CalendarService } from "./calendar/calendar.service.js";
import { CalendarController } from "./calendar/calendar.controller.js";
import { BreezeService } from "./breeze/breeze.service.js";
import { BreezeController } from "./breeze/breeze.controller.js";
import { CaptureService } from "./capture/capture.service.js";
import { CaptureController } from "./capture/capture.controller.js";
import { EmailService } from "./email/email.service.js";
@Controller("health")
class HealthController {
  @Get() get() {
    return { ok: true, service: "planbreeze-api" };
  }
}
@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/planbreeze",
      }),
    }),
    ModelsModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [
    HealthController,
    AuthController,
    UsersController,
    CirclesController,
    PlansController,
    CalendarController,
    BreezeController,
    CaptureController,
  ],
  providers: [
    Permissions,
    JobsService,
    AuthService,
    UsersService,
    CirclesService,
    PlansService,
    CalendarService,
    BreezeService,
    CaptureService,
    EmailService,
  ],
})
export class AppModule {}
