'use strict';

const gt = require('./../modules/gettext');
let Q = require('q');


/**
 * array map function to get Id from the document or ID
 * @param   {object|ObjectId}   document [[Description]]
 * @returns {ObjectId} [[Description]]
 */
function mapId(document) {
    return undefined === document._id ? document : document._id;
}

function getRemovePromises(documents) {
    let promises = [];
    documents.forEach(doc => {
        promises.push(doc.remove());
    });

    return Promise.all(promises);
}



exports = module.exports = function(params) {
	
	var mongoose = params.mongoose;
	
    var requestSchema = new mongoose.Schema({
        user: { // owner
            id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            name: { type: String, required: true },
            department: String
        },

        timeCreated: { type: Date, default: Date.now },

        createdBy: {
          id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
          name: { type: String, required: true }
        },

        events: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CalendarEvent' }],   // for absence or workperiod_recover
                                                                                    // duplicated references to events

        absence: {
            dtstart: Date,                                                          // dtstart from first event
            dtend: Date,                                                            // dtend from last event
            rightCollection: { type: mongoose.Schema.Types.ObjectId, ref: 'RightCollection' },
            distribution: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AbsenceElem' }],
            compulsoryLeave: { type: mongoose.Schema.Types.ObjectId, ref: 'CompulsoryLeave' }
        },

        time_saving_deposit: [params.embeddedSchemas.TimeSavingDeposit],

        workperiod_recover: [params.embeddedSchemas.WorperiodRecover],

        status: {                                                       // approval status for request creation or request deletion
            created: { type: String, enum: [ null, 'waiting', 'accepted', 'rejected' ], default: null },
            deleted: { type: String, enum: [ null, 'waiting', 'accepted', 'rejected' ], default: null }
        },

        approvalSteps: [params.embeddedSchemas.ApprovalStep],			// on request creation, approval steps are copied and contain references to users
                                                                        // informations about approval are stored in requestLog sub-documents instead
                                                                        // first position in array is the last approval step (top level department in user deparments ancestors)

        requestLog: [params.embeddedSchemas.RequestLog],				// linear representation of all actions
                                                                        // create, edit, delete, and effectives approval steps

        validInterval: [params.embeddedSchemas.ValidInterval]           // list of dates interval where the request is confirmed
                                                                        // absence: the quantity is consumed
                                                                        // time saving deposit: the quantity is available is time saving account
                                                                        // workperiod recover: the quantity is available in recovery right
    });







    /**
     * Register pre remove hook
     */
    requestSchema.pre('remove', function preRemoveHook(next) {

        let request = this;

        Promise.all([
            request.removeAbsenceDistribution(),
            request.removeEvents()
        ])
        .then(() => {
            next();
        })
        .catch(next);
    });

    /**
     * Remove absence distribution
     * @return {Promise}
     */
    requestSchema.methods.removeAbsenceDistribution = function() {

        let request = this;

        if (undefined === request.absence ||
            undefined === request.absence.distribution ||
            request.absence.distribution.length === 0) {
            return Promise.resolve(false);
        }


        let distribution = request.absence.distribution;
        let elementIds = distribution.map(mapId);

        let AbsenceElem = request.model('AbsenceElem');

        return AbsenceElem.find({ _id: { $in: elementIds } }).exec()
        .then(getRemovePromises);
    };


    /**
     * Remove all linked calendar events
     * @return {Promise}
     */
    requestSchema.methods.removeEvents = function() {
        let request = this;

        if (undefined === request.events ||
            undefined === request.events.length === 0) {
            return Promise.resolve(false);
        }

        let eventIds = request.events.map(mapId);

        let CalendarEvent = request.model('CalendarEvent');

        return CalendarEvent.find({ _id: { $in: eventIds } }).exec()
        .then(getRemovePromises);
    };



    /**
     * For absence request get the total quantity according to dates only
     * @return {Number}
     */
    requestSchema.methods.getQuantity = function() {
        let quantity = 0;
        this.absence.distribution.forEach(elem => {
            quantity += elem.quantity;
        });

        return quantity;
    };


    /**
     * For absence request get the total consumed quantity
     * @return {Number}
     */
    requestSchema.methods.getConsumedQuantity = function() {
        let consumed = 0;
        this.absence.distribution.forEach(elem => {
            consumed += elem.consumedQuantity;
        });

        return consumed;
    };



    /**
     * Get a displayable status, internationalized
     * @return {String}
     */
    requestSchema.methods.getDispStatus = function getDispStatus() {


        if (null !== this.status.created) {
            switch(this.status.created) {
                case 'waiting':
                    return gt.gettext('Waiting approval');
                case 'accepted':
                    return gt.gettext('Accepted');
                case 'rejected':
                    return gt.gettext('Rejected');
            }
        }


        if (null !== this.status.deleted) {
            switch(this.status.deleted) {
                case 'waiting':
                    return gt.gettext('Waiting deletion approval');
                case 'accepted':
                    return gt.gettext('Deleted');
                case 'rejected':
                    return gt.gettext('Deletion rejected');
            }
        }

        return gt.gettext('Undefined');
    };

    /**
     * Get last request log inserted for the approval workflow
     * @return {RequestLog}
     */
    requestSchema.methods.getlastApprovalRequestLog = function getlastApprovalRequestLog() {
        for(var i=this.requestLog.length-1; i>=0; i--) {
            if (this.requestLog[i].approvalStep !== undefined) {
                return this.requestLog[i];
            }
        }

        return null;
    };


    /**
     * Get the last approval step with a saved item in request log
     * @return {ApprovalStep}
     */
    requestSchema.methods.getLastApprovalStep = function getLastApprovalStep() {

        if (this.approvalSteps === undefined) {
            return null;
        }

        if (0 === this.approvalSteps.length) {
            return null;
        }

        var log = this.getlastApprovalRequestLog();

        if (null === log) {
            // nothing done about approval
            return null;
        }

        return this.approvalSteps.id(log.approvalStep);
    };




    /**
     * Get next approval step
     * return false if the last approval step in log was the last step in request
     *
     * @return {ApprovalStep|false}
     */
    requestSchema.methods.getNextApprovalStep = function getNextApprovalStep() {



        if (0 === this.approvalSteps.length) {
            return null;
        }

        var last = this.getLastApprovalStep();



        if (null === last) {
            return this.approvalSteps[0];
        }


        for(var i=this.approvalSteps.length-1; i>=0; i--) {
            if (this.approvalSteps[i]._id === last._id) {
                i--;
                break;
            }
        }


        if (this.approvalSteps[i] === undefined) {
            return false;
        }

        return this.approvalSteps[i];
    };



    /**
     * If last approval step is confirmed, notify the appliquant
     * otherwise notify the next manager using approvalsteps
     * @param {ApprovalStep} nextStep
     */
    requestSchema.methods.forwardApproval = function forwardApproval(nextStep) {

        nextStep.status = 'waiting';

        // TODO send message to managers of the nextStep


    };





    /**
     * Get the list of approvers without reply on the approval step
     * @param {ApprovalStep} approvalStep
     * @return {Array}      Array of user ID (mongoose objects)
     */
    requestSchema.methods.getRemainingApprovers = function getRemainingApprovers(approvalStep) {

        var interveners = [];

        this.requestLog.forEach(function(log) {

            if (undefined === log.approvalStep || !log.approvalStep.equals(approvalStep._id)) {
                return;
            }

            if (undefined === log.userCreated) {
                throw new Error('Wrong format in request log');
            }

            if (undefined === log.userCreated.id.id) {
                interveners.push(log.userCreated.id);
            } else {
                interveners.push(log.userCreated.id.id);
            }
        });


        var approvers = approvalStep.approvers.filter(function(approver) {

            if (undefined !== approver.id) {
                approver = approver.id;
            }

            return (-1 === interveners.indexOf(approver));
        });

        return approvers;
    };


    /**
     * @return {Array} array of string
     */
    requestSchema.methods.getRemainingApproversOnWaitingSteps = function() {
        var approvers = [];
        var request = this;

        function feApprover(approver) {
            approver = approver.toString();
            if (-1 === approvers.indexOf(approver)) {
                approvers.push(approver);
            }
        }

        this.approvalSteps.forEach(function(step) {
            if (step.status !== 'waiting') {
                return;
            }

            request.getRemainingApprovers(step).forEach(feApprover);
        });

        return approvers;
    };


    /**
     * Create recovery right from request
     * @return {Promise}
     */
    requestSchema.methods.createRecoveryRight = function createRecoveryRight() {


        if (undefined === this.workperiod_recover || 0 === this.workperiod_recover.length) {
            return Q(null);
        }


        var recover = this.workperiod_recover[0];
        var request = this;

        /**
         * @param {apiService   service
         * @param {Object} wrParams
         * @return {Promise}
         */
        function createRight()
        {
            var rightModel = request.model('Right');

            var right = new rightModel();
            right.name = recover.right.name;
            right.type = '';
            right.quantity = recover.quantity;
            right.quantity_unit = recover.right.quantity_unit;
            right.rules = [{
                title: 'Active for request dates in the renewal period',
                type: 'request_period'
            }];

            return right.save();
        }


        var deferred = Q.defer();

        createRight().then(function(right) {

            if (null === right) {
                deferred.resolve(request);
            }

            recover.right.id = right._id;
            right.createRecoveryRenewal(recover).then(function(renewal) {
                recover.right.renewal = renewal._id;
                deferred.resolve(request.save());
            });
        }, deferred.reject);


        return deferred.promise;
    };


    /**
     * Open a validity interval
     */
    requestSchema.methods.openValidInterval = function()
    {
        this.validInterval.push({
            start: new Date(),
            finish: null
        });
    };


    /**
     * Close the current validity interval
     */
    requestSchema.methods.closeValidInterval = function()
    {
        var last = this.validInterval[this.validInterval.length -1];

        if (null !== last.finish) {
            throw new Error('No open interval found');
        }

        last.finish = new Date();
    };


    /**
     * Update document when an approval step has been accepted
     * @param {ApprovalStep} approvalStep
     * @param {User} user
     * @param {String} comment
     *
     * @return {Int}
     */
    requestSchema.methods.accept = function accept(approvalStep, user, comment) {

        if (!approvalStep.isApprover(user)) {
            throw new Error('User not allowed to accept this approval step');
        }

        // update approval step

        this.addLog('wf_accept', user, comment, approvalStep);

        if ('AND' === approvalStep.operator) {
            var remain = this.getRemainingApprovers(approvalStep);
            if (0 !== remain.length) {
                return remain.length;
            }
        }

        approvalStep.status = 'accepted';


        var nextStep = this.getNextApprovalStep();

        if (null === nextStep) {
            throw new Error('Nothing to accept');
        }

        if (false === nextStep || approvalStep._id === nextStep._id) {
            this.addLog('wf_end', user);

            if ('waiting' === this.status.created) {
                this.status.created = 'accepted';
                this.openValidInterval();
            }

            if ('waiting' === this.status.deleted) {
                this.status.deleted = 'accepted';
                this.addLog('delete', user, null, approvalStep);
                this.closeValidInterval();
            }

            // the workflow sheme has ended, remove approval steps list
            this.approvalSteps = [];

            // TODO notify appliquant
            return 0;
        }

        // add log entry
        this.forwardApproval(nextStep);

        return 0;
    };


    /**
     * Update document when an approval step has been rejected
     * @param {ApprovalStep} approvalStep
     * @param {User} user
     * @param {String} comment
     */
    requestSchema.methods.reject = function reject(approvalStep, user, comment) {

        if (!approvalStep.isApprover(user)) {
            throw new Error('User not allowed to accept this approval step');
        }

        approvalStep.status = 'rejected';

         // add log entry
         this.addLog('wf_reject', user, comment, approvalStep);

        if ('waiting' === this.status.created) {
            this.status.created = 'rejected';
        }

        if ('waiting' === this.status.deleted) {
            this.status.deleted = 'rejected';
        }

        // the workflow sheme has ended, remove approval steps list
        this.approvalSteps = [];
    };


    /**
     * Set status for all events associated to the request
     * @param {String} status   TENTATIVE | CONFIRMED | CANCELLED
     * @return {Promise}
     */
    requestSchema.methods.setEventsStatus = function setEventsStatus(status) {



        if (undefined === this.populated('events')) {
            throw new Error('The events path shoud be populated on request');
        }

        var promises = [];

        for(var i=0; i< this.events.length; i++) {
            this.events[i].status = status;
            promises.push(this.events[i].save());
        }

        return Promise.all(promises);
    };


    /**
    * Add a log document to request
    * @param {String} action
    * @param {String} comment
    * @param {ApprovalStep} approvalStep
    *
    */
    requestSchema.methods.addLog = function addLog(action, user, comment, approvalStep) {

        var log = {};

        log.action = action;
        log.comment = comment;
        log.userCreated = {
            id: user._id,
            name: user.getName()
        };

        if (approvalStep !== undefined) {
            log.approvalStep = approvalStep._id;
        }

        if (this.requestLog === undefined) {
            this.requestLog = [];
        }

        this.requestLog.push(log);
    };


    /**
     * Delete invalid elements
     * @returns {Promise} the list of deleted elements
     */
    requestSchema.methods.deleteElements = function() {
        let list = [];
        this.absence.distribution.forEach(element => {
            if (undefined !== element._id) {
                list.push(element._id);
            } else {
                list.push(element);
            }
        });

        let AbsenceElem = this.model('AbsenceElem');

        return AbsenceElem.find({ _id: { $in: list }}).exec()
        .then(elements => {
            return Promise.all(
                elements.map(element => {
                    return element.remove();
                })
            );
        });
    };

    /**
     * Utility method to populate fileds in all elements of the request
     * elements must be allready populated
     *
     * @return Promise
     */
    requestSchema.methods.populateAbsenceElements = function() {
        let request = this;

        return Promise.all(
            request.absence.distribution.map(element => {
                return element.populate('events').execPopulate();
            })
        );
    };


    requestSchema.index({ 'user.id': 1 });
    requestSchema.set('autoIndex', params.autoIndex);

    params.db.model('Request', requestSchema);
};
