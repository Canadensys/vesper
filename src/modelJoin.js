/**
 * Created with JetBrains WebStorm.
 * User: cs22
 * Date: 03/10/13
 * Time: 15:17
 * To change this template use File | Settings | File Templates.
 */
VESPER.modelComparisons = new function () {

    this.modelCoverageToSelection = function (model1, model2, linkField1, linkField2) {
        var small = smaller (model1, model2);
        var large = (small == model1 ? model2 : model1);
        var smallLinkField = (small == model1 ? linkField1 : linkField2);
        var largeLinkField = (small == model1 ? linkField2 : linkField1);
        var smallData = small.getData();
        var largeData = large.getData();
        VESPER.log ("lf", linkField1, linkField2);

        small.getSelectionModel().clear();
        large.getSelectionModel().clear();

        small.getSelectionModel().setUpdating (true);
        large.getSelectionModel().setUpdating (true);

        var invMap = {};
        for (var prop in smallData) {
            if (smallData.hasOwnProperty (prop)) {
                var rec = smallData[prop];
                var val = smallData.getDataPoint (rec, smallLinkField);
                invMap[val] = prop;
            }
        }
       // VESPER.log ("invMap", invMap);
        var c = 0;
        for (var prop in largeData) {
            if (largeData.hasOwnProperty (prop)) {
                var rec = largeData[prop];
                var val = largeData.getDataPoint (rec, largeLinkField);

                if (invMap[val]) {
                    small.getSelectionModel().addToMap (invMap[val]);
                    large.getSelectionModel().addToMap (prop);
                    //if (c % 100 == 0) {
                    //    VESPER.log ("match", val, invMap[val], prop);
                    //}
                    c++;
                }
            }
        }

        small.getSelectionModel().setUpdating (false);
        large.getSelectionModel().setUpdating (false);
    };

    function smaller (model1, model2) {
        var c1 = NapVisLib.countObjProperties (model1.getData());
        var c2 = NapVisLib.countObjProperties (model2.getData());
        return (c1 < c2 ? model1 : model2);
    }
};