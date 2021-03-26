import { ActionsResponse, ImportStatus } from '../../types/GlobalType';
import User, { ImportedUser, UserRole, UserStatus } from '../../types/User';

import Constants from '../../utils/Constants';
import { DataResult } from '../../types/DataResult';
import DbParams from '../../types/database/DbParams';
import LockingHelper from '../../locking/LockingHelper';
import LockingManager from '../../locking/LockingManager';
import Logging from '../../utils/Logging';
import SchedulerTask from '../SchedulerTask';
import { ServerAction } from '../../types/Server';
import { TaskConfig } from '../../types/TaskConfig';
import Tenant from '../../types/Tenant';
import UserStorage from '../../storage/mongodb/UserStorage';
import Utils from '../../utils/Utils';

const MODULE_NAME = 'SynchronizeUsersImportTask';

export default class ImportUsersTask extends SchedulerTask {
  public async processTenant(tenant: Tenant, config?: TaskConfig): Promise<void> {
    const importUsersLock = await LockingHelper.createImportUsersLock(tenant.id);
    if (importUsersLock) {
      try {
        const dbParams: DbParams = { limit: Constants.IMPORT_PAGE_SIZE, skip: 0 };
        let importedUsers: DataResult<ImportedUser>;
        const result: ActionsResponse = {
          inError: 0,
          inSuccess: 0,
        };
        const startTime = new Date().getTime();
        // Get total number of Users to import
        const totalUsersToImport = await UserStorage.getImportedUsersCount(tenant.id);
        if (totalUsersToImport > 0) {
          await Logging.logInfo({
            tenantID: tenant.id,
            action: ServerAction.USERS_IMPORT,
            module: MODULE_NAME, method: 'processTenant',
            message: `${totalUsersToImport} User(s) are going to be imported...`
          });
        }
        do {
          // Get the imported users
          importedUsers = await UserStorage.getImportedUsers(tenant.id, { status: ImportStatus.READY }, dbParams);
          for (const importedUser of importedUsers.result) {
            try {
            // Existing Users
              const foundUser = await UserStorage.getUserByEmail(tenant.id, importedUser.email);
              if (foundUser) {
                // Check tag is already in use
                if (!foundUser.issuer) {
                  throw new Error('User is not local to the organization');
                }
                if (foundUser.deleted) {
                  throw new Error('User is deleted');
                }
                if (foundUser.status !== UserStatus.PENDING) {
                  throw new Error('User account is no longer pending');
                }
                // Update it
                foundUser.name = importedUser.name;
                foundUser.firstName = importedUser.firstName;
                await UserStorage.saveUser(tenant.id, foundUser);
                // Remove the imported User
                await UserStorage.deleteImportedUser(tenant.id, importedUser.id);
                result.inSuccess++;
                continue;
              }
              // New User
              const user: Partial<User> = {
                firstName: importedUser.firstName,
                name: importedUser.name,
                email: importedUser.email,
                locale: null, // Defaults to the browser locale
                issuer: true,
                deleted: false,
                role: UserRole.BASIC,
                status: UserStatus.ACTIVE,
                createdBy: { id: importedUser.importedBy },
                createdOn: importedUser.importedOn,
                notificationsActive: true
              };
              // Save the new User
              user.id = await UserStorage.saveUser(tenant.id, user);
              // Role need to be set separately
              await UserStorage.saveUserRole(tenant.id, user.id, UserRole.BASIC);
              // Status need to be set separately
              await UserStorage.saveUserStatus(tenant.id, user.id, UserStatus.ACTIVE);
              // Remove the imported User
              await UserStorage.deleteImportedUser(tenant.id, importedUser.id);
              result.inSuccess++;
            } catch (error) {
              importedUser.status = ImportStatus.ERROR;
              importedUser.errorDescription = error.message;
              result.inError++;
              // Update it
              await UserStorage.saveImportedUser(tenant.id, importedUser);
              // Log
              await Logging.logError({
                tenantID: tenant.id,
                action: ServerAction.USERS_IMPORT,
                module: MODULE_NAME, method: 'processTenant',
                message: `Error when importing User with email '${importedUser.email}': ${error.message}`,
                detailedMessages: { user: importedUser, error: error.message, stack: error.stack }
              });
            }
          }
          // Log
          if (importedUsers.result.length > 0 && (result.inError + result.inSuccess) > 0) {
            const intermediateDurationSecs = Math.round((new Date().getTime() - startTime) / 1000);
            await Logging.logDebug({
              tenantID: tenant.id,
              action: ServerAction.USERS_IMPORT,
              module: MODULE_NAME, method: 'processTenant',
              message: `${result.inError + result.inSuccess}/${totalUsersToImport} User(s) have been processed in ${intermediateDurationSecs}s...`
            });
          }
        } while (!Utils.isEmptyArray(importedUsers?.result));
        // Log final results
        const executionDurationSecs = Math.round((new Date().getTime() - startTime) / 1000);
        await Logging.logActionsResponse(tenant.id, ServerAction.USERS_IMPORT, MODULE_NAME, 'processTenant', result,
          `{{inSuccess}} User(s) have been imported successfully in ${executionDurationSecs}s in Tenant ${Utils.buildTenantName(tenant)}`,
          `{{inError}} User(s) failed to be imported in ${executionDurationSecs}s in Tenant ${Utils.buildTenantName(tenant)}`,
          `{{inSuccess}} User(s) have been imported successfully but {{inError}} failed in ${executionDurationSecs}s in Tenant ${Utils.buildTenantName(tenant)}`,
          `Not User has been imported in ${executionDurationSecs}s in Tenant ${Utils.buildTenantName(tenant)}`
        );
      } catch (error) {
        // Log error
        await Logging.logActionExceptionMessage(tenant.id, ServerAction.USERS_IMPORT, error);
      } finally {
        // Release the lock
        await LockingManager.release(importUsersLock);
      }
    }
  }
}
