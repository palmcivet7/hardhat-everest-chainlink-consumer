const { ethers } = require("hardhat")

const networkConfig = {
    5: {
        name: "goerli",
        _link: "0x326C977E6efc84E512bB9C30f76E30c160eD06FB",
        _oracle: "0xB9756312523826A566e222a34793E414A81c88E1",
        _jobId: "14f849816fac426abda2992cbf47d2cd",
        _oraclePayment: ethers.utils.parseEther("0.1"),
        _signUpURL: "https://wallet.everest.org",
    },
    137: {
        name: "polygon",
        _link: "0xb0897686c545045aFc77CF20eC7A532E3120E0F1",
        _oracle: "0x97b6Df5808b7f46Ee2C0e482E1B785CE3A2BC8BF",
        _jobId: "827352c4d8684571b4605f9022853ddf",
        _oraclePayment: ethers.utils.parseEther("0.01"),
        _signUpURL: "https://wallet.everest.org",
    },
}

module.exports = {
    networkConfig,
}
