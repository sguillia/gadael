'use strict';

let async = require('async');

exports = module.exports = function(user, account) {



    /**
     * Get the promise for the available quantity
     * @param   {Right} right
     * @param   {RightRenewal} renewal
     * @returns {Promise} resolve to a number
     */
    function getRenewalQuantity(right, renewal) {

        if (account.arrival > renewal.finish) {
            return null;
        }

        return renewal.getUserQuantityStats(user);
    }




    /**
     * add renewals into the right object
     * @param {Right} rightDocument
     * @param {object} right
     * @param {Array} renewals
     * @param {Date} moment
     * @param {function} callback
     */
    function processRenewals(rightDocument, beneficiary, renewals, moment, callback)
    {
        beneficiary.daysRatio = 1;
        beneficiary.errors = [];

        /**
         * Test if the renewal is accounted in beneficiary total
         */
        function inTotal(renewal) {
            return (renewal.start <= moment && renewal.finish >= moment);
        }

        async.each(renewals, function(renewalDocument, renewalCallback) {
            var p = getRenewalQuantity(rightDocument, renewalDocument);

            if (null === p) {
                // no error but the right is discarded in this renewal because of the rules or missing renewal
                return renewalCallback();
            }

            p.then(function(stat) {

                var renewalObj = renewalDocument.toObject();
                renewalObj.initial_quantity = stat.initial;
                renewalObj.consumed_quantity = stat.consumed;
                renewalObj.available_quantity = stat.available;
                renewalObj.daysRatio = stat.daysratio;

                renewalObj.initial_quantity_dispUnit = rightDocument.getDispUnit(renewalObj.initial_quantity);
                renewalObj.consumed_quantity_dispUnit = rightDocument.getDispUnit(renewalObj.consumed_quantity);
                renewalObj.available_quantity_dispUnit = rightDocument.getDispUnit(renewalObj.available_quantity);

                beneficiary.renewals.push(renewalObj);

                if (inTotal(renewalDocument)) {
                    beneficiary.initial_quantity += stat.initial;
                    beneficiary.consumed_quantity += stat.consumed;
                    beneficiary.available_quantity += stat.available;

                    if (stat.daysratio && (!beneficiary.daysRatio || renewalObj.finish > new Date())) {
                        beneficiary.daysRatio = stat.daysratio;
                    }
                }

                renewalCallback();

            })
            .catch(err => {

                beneficiary.errors.push({
                    renewal: renewalDocument,
                    error: err.message
                });

                renewalCallback();
            });

        }, callback);
    }


    return processRenewals;
};
