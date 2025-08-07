//THIS WILL EXTRACT CUSTOMISED FEILD THAT HAD NEVER INTENDED FOR THAT PURPOSE IN LOYVERSE
//===========================================================================================================================
//THIS FUNCTION VERIFIES IF THE DESCRIPTION STRUCTURE MATCHES THE IDEAL ONE
export function checkDescriptionStructure(storeDescription: string) {
  let descriptionStructure = "";
  //  ValidStructure
  const parts = storeDescription.trim().split(",");
  // console.log(parts);
  if (parts.length === 4) {
    //Email: slymutare275@gmail.com, TIN:200222222, VAT:220234498, Province:Manicaland
    const storeEmailKey = parts[0].trim().split(":")[0]; //attempt to get the STORE EMAIL KEY
    const storeEmailValue = parts[0].trim().split(":")[1]; //

    const storeTINKey = parts[1].trim().split(":")[0]; //attempt to get the STORE EMAIL KEY
    const storeTINValue = parts[1].trim().split(":")[1]; //

    const storeVATKey = parts[2].trim().split(":")[0]; //attempt to get the STORE EMAIL KEY
    const storeVATValue = parts[2].trim().split(":")[1]; //

    const storePROVINCEKey = parts[3].trim().split(":")[0]; //attempt to get the STORE EMAIL KEY
    const storePROVINCEValue = parts[3].trim().split(":")[1]; //
    if (
      storeEmailKey === "Email" &&
      storeEmailValue !== "" &&
      storeTINKey === "TIN" &&
      storeTINValue !== "" &&
      storeVATKey === "VAT" &&
      storeVATValue !== "" &&
      storePROVINCEKey === "Province" &&
      storePROVINCEValue !== ""
    ) {
      //check if the tin number and vat number are valid
      if (
        (storeTINValue.startsWith("200") || storeTINValue.startsWith("100")) &&
        storeVATValue.startsWith("220")
      ) {
        // console.log("description structure valid");
        descriptionStructure = "ValidStructure";
        return descriptionStructure;
      }
    } else {
      descriptionStructure = "InvalidStructure";
      return descriptionStructure;
    }
  }
}

//EXTRACTING STORE DETAILS

//EXTRACT STORE TIN NUMBER
export function extractstoreTINnumber(storeDescription: string) {
  let storeTINnumber = "";
  //this shows that the user has not even dared to put a STORE DESCRIPTION
  if (storeDescription === "") {
    storeTINnumber = "";
    return storeTINnumber;
  } else {
    // if there is any storeDescription present, search for the hs code, split it
    const parts = storeDescription.trim().split(",");
    storeTINnumber = parts[1].trim().split(":")[1]; //attempt to get the tin number
    //first verify if the tin number is there
    if (storeTINnumber.length >= 9) {
      //this is the real TIN AND IT IS OF STRING TYPE
      return storeTINnumber;
    } else {
      //this means its either the TIN is invalid or not there
      storeTINnumber = "";
      return storeTINnumber;
    }
  }
}

//EXTRACT STORE VAT NUMBER
export function extractstoreVATnumber(storeDescription: string) {
  let storeVATnumber = "";
  //this shows that the user has not even dared to put a STORE DESCRIPTION
  if (storeDescription === "") {
    storeVATnumber = "";
    return storeVATnumber;
  } else {
    // if there is any storeDescription present, search for the hs code, split it
    const parts = storeDescription.trim().split(",");
    storeVATnumber = parts[2].trim().split(":")[1]; //attempt to get the VAT number
    //first verify if the VAT number is there and proper size
    if (storeVATnumber.length > 8) {
      //this is the real VAT AND IT IS OF STRING TYPE
      return storeVATnumber;
    } else {
      //this means its either the VAT is invalid or not there
      storeVATnumber = "";
      return storeVATnumber;
    }
  }
}

//EXTRACT STORE EMAIL ADDRESS
export function extractstoreEmail(storeDescription: string) {
  let storeEmail = "";
  //this shows that the user has not even dared to put a STORE DESCRIPTION
  if (storeDescription === "") {
    storeEmail = "";
    return storeEmail;
  } else {
    // if there is any storeDescription present, search for the hs code, split it
    const parts = storeDescription.trim().split(",");
    storeEmail = parts[0].trim().split(":")[1]; //attempt to get the EMAIL ADDRESS
    //first verify if the EMAIL ADDRESS is there and proper size
    if (storeEmail) {
      //this is the real EMAIL ADDRESS AND IT IS OF STRING TYPE
      return storeEmail;
    } else {
      //this means its either the EMAIL ADDRESS is invalid or not there
      storeEmail = "";
      return storeEmail;
    }
  }
}

//EXTRACT STORE PROVINCE
export function extractstoreProvince(storeDescription: string) {
  let storeProvince = "";
  //this shows that the user has not even dared to put a STORE DESCRIPTION
  if (storeDescription === "") {
    storeProvince = "";
    return storeProvince;
  } else {
    // if there is any storeDescription present, search for the hs code, split it
    const parts = storeDescription.trim().split(",");
    storeProvince = parts[3].trim().split(":")[1]; //attempt to get the PROVINCE
    //first verify if the PROVINCE is there and proper size
    if (storeProvince) {
      //this is the real PROVINCE AND IT IS OF STRING TYPE
      return storeProvince;
    } else {
      //this means its either the PROVINCE is invalid or not there
      storeProvince = "";
      return storeProvince;
    }
  }
}
//==========================================================================================================================
//EXTRACTING THE CUSTOMER/BUYER DETAILS
export function checkNoteStructure(customerNOTE: string) {
  let noteStructure = "";
  //  ValidStructure
  const parts = customerNOTE.trim().split(",");
  // console.log(parts);
  //INVESTIGATE THE STRUCTURE OF CUSTOMER DETAILS
  // console.log(parts.length);
  if (parts.length === 4) {
    //VALID CUSTOMER DETAILS STRUCTURE
    const customerTINKey = parts[0].trim().split(":")[0]; //attempt to get the customer TIN KEY
    const customerTINValue = parts[0].trim().split(":")[1]; //

    const customerVATKey = parts[1].trim().split(":")[0]; //attempt to get the customer VAT KEY
    const customerVATValue = parts[1].trim().split(":")[1]; //

    const customerBalKey = parts[2].trim().split(":")[0]; //attempt to get the customer BALANCE KEY
    const customerBalValue = parts[2].trim().split(":")[1]; //

    const customerTaxKey = parts[3].trim().split(":")[0]; //attempt to get the customer TAX AMOUNT KEY
    const customerTaxValue = parts[3].trim().split(":")[1]; //
    if (
      customerTINKey === "TIN" &&
      customerTINValue !== "" &&
      customerVATKey === "VAT" &&
      customerBalKey === "Bal" &&
      customerBalValue !== "" &&
      customerTaxKey === "Tax" &&
      customerTaxValue !== ""
    ) {
      //check if the tin number
      if (
        customerTINValue.startsWith("200") ||
        customerTINValue.startsWith("100")
      ) {
        // console.log("description structure valid");
        noteStructure = "ValidStructure";
        return noteStructure;
      }
      //IN CASE THERE IS DETAILS ABOUT THE CUSTOMER VAT, CONFIRM THE CORRECT STRUCTURE
      if (customerVATValue !== "") {
        if (customerVATValue.startsWith("220")) {
          // console.log("description structure valid");
          noteStructure = "ValidStructure";
        } else {
          noteStructure = "InvalidStructure";
        }
      }
    } else {
      noteStructure = "InvalidStructure";
      return noteStructure;
    }
  }
}

//EXTRACT CUSTOMER TIN NUMBER
export function extractcustomerTIN(customerNOTE: string) {
  let customerTIN = "";
  //this shows that the user has not even dared to put a the customised feilds on the customer details
  if (customerNOTE === "") {
    customerTIN = "";
    return customerTIN;
  } else {
    // if there is any customerNOTE present, search for the CUSTOMER, split it
    const parts = customerNOTE.trim().split(",");
    customerTIN = parts[0].trim().split(":")[1]; //attempt to get the tin number
    //first verify if the tin number is there
    if (customerTIN.length > 9) {
      //this is the real TIN AND IT IS OF STRING TYPE
      return customerTIN;
    } else {
      //this means its either the TIN is invalid or not ther
      customerTIN = "";
      return customerTIN;
    }
  }
}

//EXTRACT CUSTOMER VAT NUMBER
export function extractcustomerVAT(customerNOTE: string) {
  let customerVAT = "";
  //this shows that the user has not even dared to put a the customised feilds on the customer details
  if (customerNOTE === "") {
    customerVAT = "";
    return customerVAT;
  } else {
    // if there is any customerNOTE present, search for the CUSTOMER, split it
    const parts = customerNOTE.trim().split(",");
    customerVAT = parts[1].trim().split(":")[1]; //attempt to get the CUSTOMER VAT number
    //first verify if the VAT number is there
    if (customerVAT.length > 8) {
      //this is the real VAT AND IT IS OF STRING TYPE
      return customerVAT;
    } else {
      //this means its either the VAT is invalid or not there
      customerVAT = "";
      return customerVAT;
    }
  }
}
//EXTRACT CUSTOMER CREDIT BALANCE {This will be used in the future for laybyes, account sale, advance payments etc}
export function extractcustomerBal(customerNOTE: string) {
  let customerBal = "";
  //this shows that the user has not even dared to put a the customised feilds on the customer details
  if (customerNOTE === "") {
    customerBal = "";
    return customerBal;
  } else {
    // if there is any customerNOTE present, search for the CUSTOMER, split it
    const parts = customerNOTE.trim().split(",");
    customerBal = parts[2].trim().split(":")[1]; //attempt to get the CUSTOMER CREDIT ACCOUNT BALANCE
    //first verify if the BALANCE IS OF MONEYTARY TYPE number
    if (!customerBal || !/^\d+$/.test(customerBal)) {
      //this means its either the BALANCE PRESENT is invalid or not there OR IS NOT A NUMBER (to talk to loyverse so that they put access rights there)
      let customerBal2 = 0;
      return customerBal2;
    } else {
      //this is the real VAT AND IT IS OF STRING TYPE
      return customerBal;
    }
  }
}
//EXTRACT CUSTOMER VAT AMOUNT
export function extractcustomerTaxMoney(customerNOTE: string) {
  let customerTaxMoney = "";
  //this shows that the user has not even dared to put a the customised feilds on the customer details
  if (customerNOTE === "") {
    customerTaxMoney = "";
    return customerTaxMoney;
  } else {
    // if there is any customerNOTE present, search for the CUSTOMER, split it
    const parts = customerNOTE.trim().split(",");
    customerTaxMoney = parts[2].trim().split(":")[1]; //attempt to get the CUSTOMER CREDIT ACCOUNT BALANCE
    //first verify if the BALANCE IS OF MONEYTARY TYPE number
    if (!customerTaxMoney || !/^\d+$/.test(customerTaxMoney)) {
      //this means its either the BALANCE PRESENT is invalid or not there OR IS NOT A NUMBER (to talk to loyverse so that they put access rights there)
      let customerTaxMoney2 = 0;
      return customerTaxMoney2;
    } else {
      //this is the real VAT AND IT IS OF STRING TYPE
      return customerTaxMoney;
    }
  }
}

//===========================================================================================================================
// EXCTRACT The ITEM HS code as a string, or "00000000" if invalid OUT OF THE CATEGORY
export function extractHsCode(category: string) {
  let hsCodeCandidate = "";
  //this shows that the user has not even dared to put a category
  if (category === "") {
    // hsCodeCandidate = "00000000";
    return hsCodeCandidate;
  } else {
    // if there is any category present, search for the hs code, split it
    const parts = category.trim().split(" ");
    hsCodeCandidate = parts[0]; //attempt to get the hscode
    //first verify if the hscode is there
    if (hsCodeCandidate.length === 8) {
      // Verify it's a number
      if (!hsCodeCandidate || !/^\d+$/.test(hsCodeCandidate)) {
        //this will mean that the hscode is not a number or simply it is not there
        // hsCodeCandidate = "00000000";
        return hsCodeCandidate;
      } else {
        //this is the real and not validly verified HSCODE (to verify we will have to import the hscode data and hard code it into database)
        return hsCodeCandidate;
      }
    } else {
      //this means its either the hscode is invalid or not there
      hsCodeCandidate = "00000000";
      return hsCodeCandidate;
    }
  }
}
